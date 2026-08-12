import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countContactableForPurpose,
  fetchSuppressedCustomerIds,
} from "./contactability-read";

/**
 * Dashboard KPI stats — READ-ONLY aggregates over master_customer + crm_consent +
 * crm_suppression. Server-only, service-role client passed in by the caller (which owns auth
 * + RBAC), no write path. No individual customer row is exposed (only counts), so nothing to
 * mask and no per-view audit.
 *
 * The `—` vs `0` distinction is enforced at the UI, but the SHAPE supports it: a field this
 * layer cannot source is absent from the type. Both contactable counts are MEASURED (derived
 * from the contactability rule over the live tables), not hardcoded literals.
 *
 * TWO contactable counts, deliberately separate (Migrasi 11): marketing contact and service
 * (transactional) contact are DIFFERENT permissions — CS phones customers for service, which
 * is not marketing. Collapsing them into one number would hide exactly the distinction the
 * backfill was expanded to record.
 */
export interface DashboardStats {
  /** Rows in master_customer. Real, sourced. */
  audienceSize: number;
  /** Contactable-for-MARKETING: distinct profiles with an active marketing consent AND not
   *  suppressed. Derived via a head:true inner-embed count (contactability-read.ts). */
  contactableMarketing: number;
  /** Contactable-for-SERVICE (transactional): same rule, purpose='transactional'. This is the
   *  "boleh dihubungi untuk urusan layanan" CS relies on. */
  contactableService: number;
  /** Most recent created_at, or null if the table is empty. This is data FRESHNESS, not a
   *  growth signal — master_customer arrived as batch loads, not a live feed. */
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

  // Suppression is fetched ONCE and shared across both purpose counts (suppression wins for
  // both). Today it is 0 rows, so both counts short-circuit to the plain consent count.
  const suppressed = await fetchSuppressedCustomerIds(admin);

  const [
    { count, error: sizeErr },
    { data: fresh, error: freshErr },
    contactableMarketing,
    contactableService,
  ] = await Promise.all([
    sizeQ,
    freshQ,
    countContactableForPurpose(admin, "marketing", undefined, null, suppressed),
    countContactableForPurpose(admin, "transactional", undefined, null, suppressed),
  ]);
  if (sizeErr) throw sizeErr;
  if (freshErr) throw freshErr;

  return {
    audienceSize: count ?? 0,
    contactableMarketing,
    contactableService,
    lastProfileAt: (fresh as { created_at: string | null } | null)?.created_at ?? null,
  };
}
