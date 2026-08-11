import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import { fetchDashboardStats } from "@/lib/crm/dashboard";

export const dynamic = "force-dynamic";

/**
 * Dashboard KPI API. Aggregates only (a count + a max date) — never an individual
 * profile. Gated on profile.view_list, the same action as the other read screens, so
 * a role without list access gets 403 and the UI shows `—` cards instead of numbers.
 *
 * NO AUDIT ROW, by the project rule (see /api/quality for the full statement and the
 * README): audit is mandatory only when a response contains individual rows OR when
 * the aggregate is shaped by user-supplied parameters. This endpoint takes ZERO client
 * parameters and returns only counts, so it earns no audit row — a fixed count has no
 * "whose" to record, and would only add volume for migration 8 to purge. If this ever
 * gains a client-driven filter, audit becomes mandatory (write `list.viewed`, refuse
 * on failure), exactly as /api/audience.
 *
 * No masking either (nothing individual is read). Server-side by construction — the
 * client never queries the database, it fetches this handler.
 */
export async function GET() {
  let userId: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    return NextResponse.json(
      { error: "forbidden", decision: resolveGrant(role, "profile.view_list") },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  try {
    const stats = await fetchDashboardStats(admin);
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
