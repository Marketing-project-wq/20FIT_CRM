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
 * No masking (nothing individual is read) and no audit (aggregate-only landing page;
 * see lib/crm/dashboard.ts). Server-side by construction — the client never queries
 * the database, it fetches this handler.
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
