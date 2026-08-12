import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dashboard KPI stats — READ-ONLY aggregates over master_customer + crm_consent +
 * crm_suppression. Server-only, service-role client passed in by the caller (which owns auth
 * + RBAC), no write path. No individual customer row is exposed (only counts), so nothing to
 * mask and no per-view audit.
 *
 * The `—` vs `0` distinction is enforced at the UI, but the SHAPE supports it: a field this
 * layer cannot source is absent from the type. Both contactable counts are MEASURED, not
 * hardcoded literals.
 *
 * TWO contactable counts, deliberately separate (Migrasi 11): marketing contact and service
 * (transactional) contact are DIFFERENT permissions — CS phones customers for service, which
 * is not marketing. Collapsing them would hide exactly the distinction the backfill records.
 *
 * DASHBOARD USES THE RPC, SEGMENT USES THE EMBED — do not merge the two paths:
 *   - Dashboard (here): no criteria → calls crm_contactable_counts() (Migrasi 13). That RPC
 *     does DISTINCT-then-anti-join with a per-transaction work_mem, ~2.9s embed → ~0.5-1.3s.
 *     It cannot narrow by criteria; it is the unrestricted count only.
 *   - Segment builder (lib/crm/segment-read.ts): criteria live on master_customer, so it MUST
 *     join (the inner embed). The RPC can't express criteria. Different queries, on purpose.
 * Suppression is subtracted INSIDE the RPC (K-03/K-26, per-identity → whole profile, all
 * purposes), matching isContactableForPurpose — so the two never diverge.
 */
export interface DashboardStats {
  /** Rows in master_customer. Real, sourced. */
  audienceSize: number;
  /** Contactable-for-MARKETING: distinct profiles with an active marketing consent AND not
   *  suppressed. From crm_contactable_counts() (Migrasi 13). */
  contactableMarketing: number;
  /** Contactable-for-SERVICE (transactional): same rule, purpose='transactional'. */
  contactableService: number;
  /** Most recent created_at, or null if the table is empty. Data FRESHNESS, not a growth
   *  signal — master_customer arrived as batch loads, not a live feed. */
  lastProfileAt: string | null;
}

interface ContactableCounts {
  marketing?: number;
  transactional?: number;
}

export async function fetchDashboardStats(admin: SupabaseClient): Promise<DashboardStats> {
  const sizeQ = admin.from("master_customer").select("*", { count: "exact", head: true });

  const freshQ = admin
    .from("master_customer")
    .select("created_at")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const [
    { count, error: sizeErr },
    { data: fresh, error: freshErr },
    { data: counts, error: rpcErr },
  ] = await Promise.all([
    sizeQ,
    freshQ,
    // Migrasi 13: distinct-then-anti-join with per-txn work_mem; suppression subtracted inside;
    // ALWAYS returns both keys (0 = measured zero, K-08). Segment builder does NOT use this.
    admin.rpc("crm_contactable_counts"),
  ]);
  if (sizeErr) throw sizeErr;
  if (freshErr) throw freshErr;
  if (rpcErr) throw rpcErr;

  const c = (counts ?? {}) as ContactableCounts;

  return {
    audienceSize: count ?? 0,
    contactableMarketing: c.marketing ?? 0,
    contactableService: c.transactional ?? 0,
    lastProfileAt: (fresh as { created_at: string | null } | null)?.created_at ?? null,
  };
}
