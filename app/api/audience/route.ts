import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, shouldMaskContact, resolveGrant } from "@/lib/auth/roles";
import {
  fetchAudience,
  clampPageSize,
  AUDIENCE_DEFAULT_PAGE_SIZE,
  SEGMENT_NULL,
  type RevenueFilter,
} from "@/lib/crm/audience";

export const dynamic = "force-dynamic";

/**
 * Audience pool read API. This is the ONLY door to master_customer for the UI.
 *
 * Enforcement, in order, all SERVER-SIDE:
 *   1. Must be signed in (anon key session via cookies) -> else 401.
 *   2. Role resolved server-side via the service role -> never trust the client.
 *   3. FAIL-CLOSED on profile.view_list. An unscoped unit_manager (own_unit ->
 *      needs_scope) and any role without list access get 403.
 *   4. analyst (and any non-full-contact role) -> phone/email masked HERE before the
 *      response is built. Real values never leave the server.
 *   5. Every successful list read writes a `list.viewed` audit row (PRD 17.1). If that
 *      write fails we REFUSE to serve the data (503) — an unlogged read is not allowed.
 *
 * There is no POST/PUT/DELETE and no export path: read-only by construction.
 */
export async function GET(request: NextRequest) {
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
            : "Peran Anda tidak memiliki izin melihat daftar profil.",
      },
      { status: 403 },
    );
  }

  // 4. Masking decision (server-side)
  const masked = shouldMaskContact(role);

  // Parse + sanitize query params
  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = clampPageSize(
    Number.parseInt(sp.get("pageSize") ?? String(AUDIENCE_DEFAULT_PAGE_SIZE), 10) ||
      AUDIENCE_DEFAULT_PAGE_SIZE,
  );
  const unit = sp.get("unit") || null;
  const segment = sp.get("segment") || null; // may be SEGMENT_NULL
  const city = sp.get("city")?.trim() || null;
  const revenueParam = sp.get("revenue");
  const revenue: RevenueFilter =
    revenueParam === "has" || revenueParam === "none" ? revenueParam : "all";

  const admin = createAdminClient();

  let result;
  try {
    result = await fetchAudience(admin, { page, pageSize, unit, segment, city, revenue }, masked);
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
    summary: `Audience pool dibuka (hal ${result.page}, ${result.rows.length} baris ditampilkan${
      masked ? ", kontak disamarkan" : ""
    }).`,
    // NON-PII only: page + the filter values used (aggregate context, no individual
    // customer identity). Never put a customer's name/phone/email here.
    metadata: {
      page: result.page,
      page_size: result.pageSize,
      returned: result.rows.length,
      total: result.total,
      masked,
      filters: {
        unit: unit ?? null,
        segment: segment === SEGMENT_NULL ? "(null cohort)" : segment ?? null,
        city: city ?? null,
        revenue,
      },
    },
  });
  if (auditError) {
    return NextResponse.json(
      { error: "audit_failed", message: "Pembacaan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
