import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { isUuid } from "@/lib/crm/audience";
import { fetchProfileEnrichment } from "@/lib/crm/enrichment";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Reveal the sensitive Hyrox identity fields (NIK, birth date, blood type, emergency contact)
 * for ONE profile. This is the first place the project surfaces a national identity number, so:
 *   - Gate: profile.view_health (super_admin, crm_manager only) — fail-closed 403.
 *   - Each reveal writes ONE audit row: action `profile.viewed` (NOT a new action — the
 *     migration-8 allowlist prunes by exact name), target_id = customer_id, metadata records
 *     the KINDS of field opened (nik/birthdate/…), NEVER the values.
 *   - An unlogged reveal is refused (503) — accountability before disclosure.
 * The main profile GET returns these fields MASKED; only this endpoint returns them unmasked.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const role = await getCurrentUserRole();
  if (!isPermitted(role, "profile.view_health")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "profile.view_health"),
        message: "Membuka field identitas butuh peran profile.view_health (super_admin, crm_manager).",
      },
      { status: 403 },
    );
  }

  const id = params.id;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createAdminClient();
  let enrichment;
  try {
    enrichment = await fetchProfileEnrichment(admin, id, { canViewHealth: true, reveal: true });
  } catch (e) {
    logApiFailure("/audience/[id]/identity", "reveal_query_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  if (!enrichment.matchable || !enrichment.hyrox.hasSensitive || !enrichment.hyrox.sensitive) {
    return NextResponse.json({ error: "no_data", message: "Tidak ada field identitas untuk profil ini." }, { status: 404 });
  }

  const s = enrichment.hyrox.sensitive;
  // Which KINDS are being opened — for the audit metadata. Values NEVER go in metadata.
  const kinds: string[] = [];
  if (s.nik) kinds.push("nik");
  if (s.tglLahir) kinds.push("birthdate");
  if (s.golDarah) kinds.push("blood_type");
  if (s.kontakDarurat || s.noKontakDarurat) kinds.push("emergency_contact");

  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "profile.viewed",
    target_table: "master_customer",
    target_id: id,
    summary: `Field identitas Hyrox dibuka (${kinds.join(", ") || "—"}).`,
    // NON-PII: only the KINDS of field opened + source. NEVER the NIK/DOB/contact values.
    metadata: { view: "identity_reveal", fields: kinds, source: "cf_hyrox_participants" },
  });
  if (auditError) {
    logApiFailure("/audience/[id]/identity", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: "Pembukaan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json({ sensitive: s }, { headers: { "Cache-Control": "no-store" } });
}
