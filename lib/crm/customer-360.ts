import "server-only";

/**
 * Customer 360° analytics — engagement across the whole 20FIT ecosystem.
 *
 * Data sources (service_role / admin client, paged — no new SQL functions):
 *   1. customer_engagement  — one row per (customer_id, unit[, product]); the per-unit footprint.
 *   2. customer_360_transactions_v1 — transaction detail (unit, amount, cust_key) for revenue.
 *
 * Everything is aggregated in JS from paged reads, the same way lib/crm/event-analytics.ts works:
 * no RPC, no materialized view, so there is nothing new to migrate. Every Supabase read captures
 * `error` and throws on it (T-69: a failed read must never be mistaken for an empty table).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const PAGE = 1000;

/** Canonical unit order + known labels. Units outside this list still render (appended, raw). */
export const KNOWN_UNITS = ["membership", "event", "arena", "clinic", "shop", "gym"] as const;

export interface UnitUsers {
  unit: string;
  users: number;
}

export interface RevenueByUnitRow {
  unit: string;
  txnCount: number;
  totalRevenue: number;
  uniqueCustomers: number;
}

export interface CrossUnitMatrix {
  /** Units in display order (by distinct-user count, desc). */
  units: string[];
  /** cells[i][j] = users in BOTH units[i] and units[j]; diagonal = total users in units[i]. */
  cells: number[][];
}

export interface UnitCombination {
  units: string[];
  unitCount: number;
  userCount: number;
}

export interface Customer360Data {
  totalCustomers: number;
  multiUnitUsers: number;
  avgUnitsPerUser: number;
  totalRevenue: number;
  /** How many customers fall in each "number of distinct units" bucket (1, 2, 3, …). */
  unitCountDistribution: { unitCount: number; users: number }[];
  unitBreakdown: UnitUsers[];
  crossUnitMatrix: CrossUnitMatrix;
  revenueByUnit: RevenueByUnitRow[];
  topCombinations: UnitCombination[];
  /** Journey: the unit a customer first engaged in (earliest first_seen_at), counted per unit. */
  entryUnits: UnitUsers[];
  generatedAt: string;
}

/** Order a set of units: known units first (in KNOWN_UNITS order), then any extras alphabetically. */
function orderUnits(units: Iterable<string>): string[] {
  const set = new Set(units);
  const ordered: string[] = [];
  for (const u of KNOWN_UNITS) if (set.has(u)) { ordered.push(u); set.delete(u); }
  return ordered.concat(Array.from(set).sort());
}

export async function fetchCustomer360Analytics(admin: AdminClient): Promise<Customer360Data> {
  // === Source 1: customer_engagement → per-customer unit footprint + entry unit ===
  // unitsByCustomer: customer_id → Set<unit>. entryByCustomer: customer_id → { unit, at }.
  const unitsByCustomer = new Map<string, Set<string>>();
  const entryByCustomer = new Map<string, { unit: string; at: string }>();

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_engagement")
      .select("customer_id, unit, first_seen_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Failed to fetch customer_engagement");
    const rows = (data ?? []) as { customer_id: string; unit: string | null; first_seen_at: string | null }[];
    for (const r of rows) {
      if (!r.customer_id || !r.unit) continue;
      let set = unitsByCustomer.get(r.customer_id);
      if (!set) { set = new Set(); unitsByCustomer.set(r.customer_id, set); }
      set.add(r.unit);

      if (r.first_seen_at) {
        const cur = entryByCustomer.get(r.customer_id);
        if (!cur || r.first_seen_at < cur.at) {
          entryByCustomer.set(r.customer_id, { unit: r.unit, at: r.first_seen_at });
        }
      }
    }
    if (rows.length < PAGE) break;
  }

  // === KPIs + unit breakdown + unit-count distribution (one pass over customers) ===
  const totalCustomers = unitsByCustomer.size;
  let multiUnitUsers = 0;
  let totalUnitMemberships = 0;
  const perUnitUsers = new Map<string, number>();
  const unitCountBuckets = new Map<number, number>();

  unitsByCustomer.forEach((set) => {
    const n = set.size;
    totalUnitMemberships += n;
    if (n > 1) multiUnitUsers++;
    unitCountBuckets.set(n, (unitCountBuckets.get(n) ?? 0) + 1);
    set.forEach((u) => perUnitUsers.set(u, (perUnitUsers.get(u) ?? 0) + 1));
  });

  const avgUnitsPerUser = totalCustomers > 0
    ? Math.round((totalUnitMemberships / totalCustomers) * 10) / 10
    : 0;

  const units = orderUnits(perUnitUsers.keys());
  const unitBreakdown: UnitUsers[] = units
    .map((unit) => ({ unit, users: perUnitUsers.get(unit) ?? 0 }))
    .sort((a, b) => b.users - a.users);

  const unitCountDistribution = Array.from(unitCountBuckets.entries())
    .map(([unitCount, users]) => ({ unitCount, users }))
    .sort((a, b) => a.unitCount - b.unitCount);

  // === Cross-unit matrix (users in unit i AND unit j) ===
  // Matrix order follows unitBreakdown (most-used first) so the heatmap reads top-left heavy.
  const matrixUnits = unitBreakdown.map((u) => u.unit);
  const idx = new Map<string, number>();
  matrixUnits.forEach((u, i) => idx.set(u, i));
  const n = matrixUnits.length;
  const cells: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  unitsByCustomer.forEach((set) => {
    const present = Array.from(set).map((u) => idx.get(u)!).filter((i) => i !== undefined);
    for (let a = 0; a < present.length; a++) {
      for (let b = a; b < present.length; b++) {
        const i = present[a];
        const j = present[b];
        cells[i][j]++;
        if (i !== j) cells[j][i]++;
      }
    }
  });

  const crossUnitMatrix: CrossUnitMatrix = { units: matrixUnits, cells };

  // === Top cross-unit combinations (customers with ≥2 distinct units) ===
  const comboCounts = new Map<string, { units: string[]; count: number }>();
  unitsByCustomer.forEach((set) => {
    if (set.size < 2) return;
    const sorted = orderUnits(set);
    const key = sorted.join("+");
    const existing = comboCounts.get(key);
    if (existing) existing.count++;
    else comboCounts.set(key, { units: sorted, count: 1 });
  });
  const topCombinations: UnitCombination[] = Array.from(comboCounts.values())
    .map((c) => ({ units: c.units, unitCount: c.units.length, userCount: c.count }))
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 15);

  // === Journey: entry (first-touch) unit distribution ===
  const entryCounts = new Map<string, number>();
  entryByCustomer.forEach(({ unit }) => entryCounts.set(unit, (entryCounts.get(unit) ?? 0) + 1));
  const entryUnits: UnitUsers[] = orderUnits(entryCounts.keys())
    .map((unit) => ({ unit, users: entryCounts.get(unit) ?? 0 }))
    .sort((a, b) => b.users - a.users);

  // === Source 2: customer_360_transactions_v1 → revenue ===
  const revAgg = new Map<string, { txnCount: number; totalRevenue: number; custKeys: Set<string> }>();
  let totalRevenue = 0;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_360_transactions_v1")
      .select("unit, amount, cust_key")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Failed to fetch customer_360_transactions_v1");
    const rows = (data ?? []) as { unit: string | null; amount: number | string | null; cust_key: string | null }[];
    for (const r of rows) {
      const unit = r.unit ?? "unknown";
      const amount = typeof r.amount === "string" ? Number(r.amount) : (r.amount ?? 0);
      const amt = Number.isFinite(amount) ? amount : 0;
      totalRevenue += amt;
      let agg = revAgg.get(unit);
      if (!agg) { agg = { txnCount: 0, totalRevenue: 0, custKeys: new Set() }; revAgg.set(unit, agg); }
      agg.txnCount++;
      agg.totalRevenue += amt;
      if (r.cust_key) agg.custKeys.add(r.cust_key);
    }
    if (rows.length < PAGE) break;
  }

  const revenueByUnit: RevenueByUnitRow[] = Array.from(revAgg.entries())
    .map(([unit, a]) => ({
      unit,
      txnCount: a.txnCount,
      totalRevenue: a.totalRevenue,
      uniqueCustomers: a.custKeys.size,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  return {
    totalCustomers,
    multiUnitUsers,
    avgUnitsPerUser,
    totalRevenue,
    unitCountDistribution,
    unitBreakdown,
    crossUnitMatrix,
    revenueByUnit,
    topCombinations,
    entryUnits,
    generatedAt: new Date().toISOString(),
  };
}
