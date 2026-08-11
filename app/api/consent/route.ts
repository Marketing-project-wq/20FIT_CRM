import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, shouldMaskContact, resolveGrant } from "@/lib/auth/roles";
import { fetchConsentScreen, CONSENT_PAGE_SIZE } from "@/lib/crm/consent";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Consent + suppression register read API. Returns INDIVIDUAL rows and takes filters
 * (pagination), so by the project audit rule it MUST audit: `list.viewed` with
 * target_table = 'crm_consent' (NOT a new action — migration 8 purges on an exact
 * allowlist). Unlogged read is refused (503).
 *
 * Gate: consent.edit (super_admin, crm_manager, data_steward) — the SAME action
 * canSeeNav("/consent") resolves to, even though the screen is read-only this sprint.
 * Fail-closed. Service role — both tables are RLS ON with no policy.
 */
export async function GET(request: NextRequest) {
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

  const role = await getCurrentUserRole();
  if (!isPermitted(role, "consent.edit")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "consent.edit"),
        message: "Hanya super_admin, crm_manager, dan data_steward yang boleh melihat register consent.",
      },
      { status: 403 },
    );
  }

  const masked = shouldMaskContact(role);
  const sp = request.nextUrl.searchParams;
  const consentPage = Math.max(1, Number.parseInt(sp.get("cpage") ?? "1", 10) || 1);
  const suppressionPage = Math.max(1, Number.parseInt(sp.get("spage") ?? "1", 10) || 1);

  const admin = createAdminClient();
  let result;
  try {
    result = await fetchConsentScreen(
      admin,
      { consentPage, suppressionPage, pageSize: CONSENT_PAGE_SIZE },
      masked,
    );
  } catch (e) {
    logApiFailure("/consent", "consent_query_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Mandatory audit — individual rows + filters.
  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "list.viewed",
    target_table: "crm_consent",
    summary: `Register consent dibuka (consent ${result.consent.total} baris, suppression ${result.suppression.total} baris).`,
    metadata: {
      view: "consent_register",
      consent_total: result.consent.total,
      suppression_total: result.suppression.total,
      consent_page: result.consent.page,
      suppression_page: result.suppression.page,
      masked,
    },
  });
  if (auditError) {
    logApiFailure("/consent", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: "Pembacaan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
