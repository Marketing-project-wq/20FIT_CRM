import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Activity-layer read (Fase 1). Reads the pre-computed crm_customer_activity summary — the ONLY
 * honest source of "when did this person join" (joined_at = earliest real activity event) and
 * "when were they last active" (last_active_at = latest). Built from live source tables
 * (arena_bookings, clinic_bookings, clinic_transactions, cf_hyrox_participants,
 * my20fit_user_activity) by crm_refresh_customer_activity, NOT from master_customer's load-stamp
 * time columns (K-19). Zero writes here — read only.
 */

export interface ActivityCoverage {
  /** Profiles with at least one real activity event (have joined_at + last_active_at). */
  withActivity: number;
  /** master_customer total, for the honest "N of TOTAL" framing. */
  total: number;
  /** Most recent last_active_at across all profiles — proof the layer is live, not frozen. */
  mostRecentActive: string | null;
  /** When the summary table was last refreshed. */
  refreshedAt: string | null;
}

export async function loadActivityCoverage(): Promise<ActivityCoverage> {
  const admin = createAdminClient();
  const [withAct, total, recent] = await Promise.all([
    admin.from("crm_customer_activity").select("customer_id", { count: "exact", head: true }),
    admin.from("master_customer").select("customer_id", { count: "exact", head: true }),
    admin
      .from("crm_customer_activity")
      .select("last_active_at, refreshed_at")
      .order("last_active_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const recentRow = (recent.data ?? null) as { last_active_at: string; refreshed_at: string } | null;
  return {
    withActivity: withAct.count ?? 0,
    total: total.count ?? 0,
    mostRecentActive: recentRow?.last_active_at ?? null,
    refreshedAt: recentRow?.refreshed_at ?? null,
  };
}

const IN_CHUNK = 500; // uuids per .in() batch — bounded URL length

/**
 * Resolve the set of customer_ids matching a TIME criterion, from crm_customer_activity:
 *  - joinedWithinDays: joined_at >= now() - N days  (welcome — recently joined)
 *  - inactiveForDays:  last_active_at <= now() - N days  (re-engagement — gone quiet)
 * Both apply ONLY to profiles that HAVE an activity row (the 725, not the whole pool). A profile
 * with no activity signal simply is not in this table, so it cannot match a time filter — which
 * is the honest behaviour (K-19): we never invent a date for someone we have no activity for.
 * Returns the id set, or null when neither time criterion is set.
 */
export async function resolveActivityTimeIds(
  admin: SupabaseClient,
  joinedWithinDays: number | null,
  inactiveForDays: number | null,
): Promise<Set<string> | null> {
  if (joinedWithinDays == null && inactiveForDays == null) return null;
  let q = admin.from("crm_customer_activity").select("customer_id");
  if (joinedWithinDays != null) {
    const since = new Date(Date.now() - joinedWithinDays * 86_400_000).toISOString();
    q = q.gte("joined_at", since);
  }
  if (inactiveForDays != null) {
    const before = new Date(Date.now() - inactiveForDays * 86_400_000).toISOString();
    q = q.lte("last_active_at", before);
  }
  const { data, error } = await q;
  if (error) throw error;
  const out = new Set<string>();
  for (const r of (data ?? []) as { customer_id: string }[]) out.add(r.customer_id);
  return out;
}

export { IN_CHUNK as ACTIVITY_IN_CHUNK };

