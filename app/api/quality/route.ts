import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import { fetchQualitySnapshot } from "@/lib/crm/quality";

export const dynamic = "force-dynamic";

/**
 * Data-quality snapshot API. Aggregates only — this endpoint can never return an
 * individual profile.
 *
 * Enforcement mirrors /api/audience exactly, in the same order, all server-side:
 *   1. Signed in -> else 401.
 *   2. Role resolved server-side via the service role; the client is never trusted.
 *   3. FAIL-CLOSED on profile.view_list. Gating quality on the SAME action the
 *      audience list uses is deliberate — canSeeNav("/quality") already resolves to
 *      canViewProfileList, and a menu item that is visible but 403s is a bug. If the
 *      PRD later gives quality its own matrix row, this moves with it.
 *   4. NO masking step, and that is not an omission: fetchQualitySnapshot runs every
 *      query with head:true, so no phone, email or name is ever read. There is
 *      nothing to mask.
 *   5. Every successful read writes an audit row. If that write fails we REFUSE to
 *      serve (503) — an unlogged read of customer data is not allowed here either.
 *
 * WHY THE AUDIT ACTION IS `list.viewed` AND NOT `quality.viewed`:
 * migration 8 (crm_purge_audit_log) purges on an ALLOWLIST of exact operational
 * actions — profile.viewed, list.viewed, search.*, login.* — and permanently
 * protects the compliance categories. A brand-new `quality.viewed` would sit in
 * NEITHER set: never purged, never protected, silently accumulating forever. Reusing
 * the allowlisted action keeps retention correct without touching the diverged
 * migration ledger; `metadata.view = "quality"` is what distinguishes it. Renaming
 * this action means editing migration 8's allowlist first.
 *
 * There is no POST/PUT/DELETE and no export path: read-only by construction.
 */
export async function GET() {
  // 1. Session
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
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 2 + 3. Role, fail-closed
  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return NextResponse.json(
      {
        error: "forbidden",
        decision,
        message:
          decision === "needs_scope"
            ? "unit_manager tanpa cakupan unit yang terdefinisi — akses ditolak (fail-closed sampai tabel unit-scope ada)."
            : "Peran Anda tidak memiliki izin melihat kualitas data profil.",
      },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  let snapshot;
  try {
    snapshot = await fetchQualitySnapshot(admin);
  } catch {
    // Never leak DB internals to the client.
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // 5. Mandatory audit. An unlogged read is not served.
  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "list.viewed",
    target_table: "master_customer",
    summary: `Dasbor kualitas data dibuka (agregat ${snapshot.total} profil, tanpa membaca baris individual).`,
    // AGGREGATE ONLY. Nothing here identifies a customer, by construction.
    metadata: {
      view: "quality",
      total: snapshot.total,
      aggregate_only: true,
    },
  });
  if (auditError) {
    return NextResponse.json(
      { error: "audit_failed", message: "Pembacaan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
