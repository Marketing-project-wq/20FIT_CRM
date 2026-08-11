import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dashboard KPI stats — READ-ONLY aggregates over the EXISTING master_customer.
 * Same posture as lib/crm/quality.ts: server-only, service-role client passed in by
 * the caller (which owns auth + RBAC), no write path. Counts + one max() only — no
 * individual customer row is read, so there is nothing to mask and no per-view audit
 * (the dashboard is the landing page; auditing every load would flood list.viewed
 * with no accountability gain, since no individual data is exposed).
 *
 * The `—` vs `0` distinction is enforced at the UI, but the SHAPE here supports it:
 * a field this layer cannot source is simply absent from the type. `contactable` is
 * a hard 0 (a legal fact — no consent register exists), not a measured aggregate.
 */
export interface DashboardStats {
  /** Rows in master_customer. Real, sourced. */
  audienceSize: number;
  /** Most recent created_at, or null if the table is empty. This is data FRESHNESS,
   *  not a growth signal — master_customer is a one-time import, not a live feed. */
  lastProfileAt: string | null;
}

export async function fetchDashboardStats(admin: SupabaseClient): Promise<DashboardStats> {
  const sizeQ = admin.from("master_customer").select("*", { count: "exact", head: true });

  const freshQ = admin
    .from("master_customer")
    .select("created_at")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const [{ count, error: sizeErr }, { data: fresh, error: freshErr }] = await Promise.all([
    sizeQ,
    freshQ,
  ]);
  if (sizeErr) throw sizeErr;
  if (freshErr) throw freshErr;

  return {
    audienceSize: count ?? 0,
    lastProfileAt: (fresh as { created_at: string | null } | null)?.created_at ?? null,
  };
}
