import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ECOSYSTEM_UNITS,
  classifyLastSeen,
  type EcosystemUnit,
  type LastSeenClass,
} from "./engagement-constants";
import type { EcosystemQuality, EcosystemUnitSpread } from "./quality-types";

/**
 * Ecosystem read layer — READ-ONLY over the EXISTING customer_engagement table
 * (90.419 rows). Sprint 3N: surface where a customer shows up across the 20FIT
 * ecosystem. Same posture as lib/crm/audience.ts:
 *   - server-only; the service-role client is passed in by the caller (route/page),
 *     which owns auth + RBAC.
 *   - NO write path. NO copy into any crm_* table. The source is read in place.
 *   - Link to a profile is ALWAYS by customer_id — never by phone or email (K-19 note:
 *     identity matching is customer_id; the ecosystem key is the same uuid).
 *
 * COLUMNS READ — deliberately narrow. `raw_value`, `source_row_id` and `period` are
 * NEVER selected: raw_value can carry arbitrary source payload (possibly NIK / birth
 * date / other sensitive Phase-0 data), and source_row_id is an external key. Only
 * unit, product, engagement_count and the two timestamps + source leave the database.
 */

const SAFE_COLUMNS = "unit, product, engagement_count, first_seen_at, last_seen_at, source";

/** One ecosystem touchpoint for a single profile, already classified (K-19). */
export interface EngagementRow {
  unit: string;
  product: string;
  engagementCount: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  source: string | null;
  /** How to read last_seen_at — computed here so the UI can never invent a date. */
  lastSeenClass: LastSeenClass;
}

export interface ProfileEngagement {
  rows: EngagementRow[];
  totalRows: number;
  units: string[];
  /** True when at least one row carries a real activity date (last_seen_at > first_seen_at,
   *  not future). When false, the profile's ecosystem history is a set of load stamps —
   *  the UI must say "history not recorded", NEVER "inactive". */
  hasRealActivity: boolean;
  /** True when at least one row is future-dated (a data defect, surfaced not hidden). */
  hasFutureAnomaly: boolean;
}

interface RawEngagementRow {
  unit: string;
  product: string;
  engagement_count: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  source: string | null;
}

/**
 * Every ecosystem touchpoint for ONE profile, keyed by customer_id. Returns [] when the
 * profile has no ecosystem rows (164 of 82.253 profiles on 11 Agu) — that is an honest
 * empty, distinct from "not recorded" (rows exist but all load-stamped). Rows are ordered
 * real-activity first (most informative), then by unit/product for stability.
 */
export async function fetchProfileEngagement(
  admin: SupabaseClient,
  customerId: string,
): Promise<ProfileEngagement> {
  const { data, error } = await admin
    .from("customer_engagement")
    .select(SAFE_COLUMNS)
    .eq("customer_id", customerId)
    .order("unit", { ascending: true })
    .order("product", { ascending: true });
  if (error) throw error;

  const now = Date.now();
  const raw = (data ?? []) as unknown as RawEngagementRow[];
  const rows: EngagementRow[] = raw.map((r) => ({
    unit: r.unit,
    product: r.product,
    engagementCount: r.engagement_count,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    source: r.source,
    lastSeenClass: classifyLastSeen(r.first_seen_at, r.last_seen_at, now),
  }));

  // Real-activity rows first, then future anomalies, then load stamps — informative first.
  const rank: Record<LastSeenClass, number> = {
    real_activity: 0,
    future_anomaly: 1,
    load_stamp: 2,
    missing: 3,
  };
  rows.sort((a, b) => rank[a.lastSeenClass] - rank[b.lastSeenClass]);

  const units = Array.from(new Set(rows.map((r) => r.unit))).sort();
  return {
    rows,
    totalRows: rows.length,
    units,
    hasRealActivity: rows.some((r) => r.lastSeenClass === "real_activity"),
    hasFutureAnomaly: rows.some((r) => r.lastSeenClass === "future_anomaly"),
  };
}

// ── SEGMENT SUPPORT (T3): resolve ecosystem criteria to distinct customer_ids ─────────

/** Hard ceiling on ids read for one ecosystem criterion. Set FAR above the real maximum
 *  (membership/Fitco User = 67.828 on 11 Agu) so it never truncates a real result; if it
 *  is ever hit, we THROW rather than silently return a short count (no silent caps). */
const ECOSYSTEM_ID_CEILING = 200_000;
const PAGE = 1000;

/**
 * Distinct customer_ids that have at least one customer_engagement row matching the given
 * ecosystem unit/product. Reads ONLY the customer_id column (a uuid — opaque, not PII),
 * paginated to exhaustion, deduped in memory. count(distinct) is not expressible in
 * PostgREST, so this is the honest way to get a distinct set without a new SQL view/RPC.
 */
export async function resolveEcosystemCustomerIds(
  admin: SupabaseClient,
  unit: EcosystemUnit | null,
  product: string | null,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from("customer_engagement")
      .select("customer_id")
      .range(from, from + PAGE - 1);
    if (unit) q = q.eq("unit", unit);
    if (product) q = q.eq("product", product);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as { customer_id: string }[];
    for (const r of batch) ids.add(r.customer_id);
    if (batch.length < PAGE) break;
    if (ids.size > ECOSYSTEM_ID_CEILING) {
      throw new Error("ecosystem id set exceeded ceiling — refuse to truncate silently");
    }
  }
  return ids;
}

// ── QUALITY SUPPORT (T4): parameter-free aggregates for /quality ──────────────────────
// EcosystemQuality / EcosystemUnitSpread shapes live in quality-types.ts (client-safe) so
// the dashboard can render them; imported above.

async function countEngagement(
  admin: SupabaseClient,
  apply?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  let q = admin.from("customer_engagement").select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Parameter-free ecosystem aggregates for /quality. NOT audited (K-07: no user
 * parameters, like the rest of /quality). Only the numbers PostgREST can compute live
 * are here — the load-stamp % (last_seen_at = first_seen_at, column-to-column) and the
 * distinct-customer coverage (count distinct) CANNOT be expressed in PostgREST without a
 * SQL view/RPC, which this project does not add for an evaluation screen. Those two live
 * in VERIFIED_ARTIFACTS (quality-types.ts), dated — same discipline as first_seen_at >
 * created_at. Every query here is head:true, so no engagement row is read into memory.
 */
export async function fetchEcosystemQuality(admin: SupabaseClient): Promise<EcosystemQuality> {
  const nowIso = new Date().toISOString();
  const [totalRows, futureDated, ...unitCounts] = await Promise.all([
    countEngagement(admin),
    countEngagement(admin, (q) => q.gt("last_seen_at", nowIso)),
    ...ECOSYSTEM_UNITS.map((u) => countEngagement(admin, (q) => q.eq("unit", u))),
  ]);

  const unitSpread: EcosystemUnitSpread[] = ECOSYSTEM_UNITS.map((unit, i) => ({
    unit,
    rows: unitCounts[i],
  }));

  return { totalRows, unitSpread, futureDated, computedAt: nowIso };
}
