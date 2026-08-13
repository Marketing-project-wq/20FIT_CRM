import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { fetchAuditLog, clampAuditPageSize } from "@/lib/crm/audit-log";
import { AUDIT_DEFAULT_PAGE_SIZE } from "@/lib/crm/audit-log-constants";
import { logApiFailure } from "@/lib/crm/failure-log";
import { getServerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Audit-log read API. Returns INDIVIDUAL audit rows and accepts user FILTERS, so by
 * the project audit rule it audits ITSELF: opening this screen writes a `list.viewed`
 * row with target_table = 'crm_audit_log' (not a new `audit.viewed` — migration 8
 * purges on an exact allowlist). An unlogged read is refused (503).
 *
 * Gate: audit.view (super_admin, crm_manager only), the SAME action
 * canSeeNav("/settings") resolves to. Fail-closed. Service role — crm_audit_log has
 * RLS ON with no policy, so the anon key cannot and must not read it.
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

  const { t } = getServerDict();
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "audit.view"),
        message: t.audit.apiRoleDenied,
      },
      { status: 403 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = clampAuditPageSize(
    Number.parseInt(sp.get("pageSize") ?? String(AUDIT_DEFAULT_PAGE_SIZE), 10) ||
      AUDIT_DEFAULT_PAGE_SIZE,
  );
  const action = sp.get("action")?.trim() || null;
  const actorEmail = sp.get("actorEmail")?.trim() || null;
  const dateFrom = sp.get("from")?.trim() || null;
  const dateTo = sp.get("to")?.trim() || null;
  const catParam = sp.get("category");
  const category =
    catParam === "compliance" || catParam === "operational" || catParam === "all"
      ? catParam
      : "all";

  const admin = createAdminClient();

  let result;
  try {
    result = await fetchAuditLog(admin, { page, pageSize, action, actorEmail, dateFrom, dateTo, category });
  } catch (e) {
    logApiFailure("/audit", "audit_query_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Mandatory audit — this endpoint returns individual rows and takes filters.
  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "list.viewed",
    target_table: "crm_audit_log",
    summary: `Audit log dibuka (hal ${result.page}, ${result.rows.length} baris ditampilkan).`,
    // NON-PII: page + filter values used. No individual audit-row content is copied here.
    metadata: {
      view: "audit_log",
      page: result.page,
      page_size: result.pageSize,
      returned: result.rows.length,
      total: result.total,
      filters: {
        action: action ?? null,
        actor_email: actorEmail ?? null,
        from: dateFrom ?? null,
        to: dateTo ?? null,
      },
    },
  });
  if (auditError) {
    logApiFailure("/audit", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: t.audit.apiAuditFailed },
      { status: 503 },
    );
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
