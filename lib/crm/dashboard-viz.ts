import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dashboard visualisations (Dashboard Visual sprint) — READ-ONLY aggregates for the bar charts.
 * Server-only, service-role client passed in by the route. No migration/RPC is added: every figure
 * here is expressible in PostgREST (head:true counts) or read from the existing mirror.
 *
 * WHAT IS LIVE vs SNAPSHOT (shown on screen, TUGAS 3):
 *  - contactCoverage: LIVE head:true counts over master_customer.
 *  - eventRegistrations: LIVE — a paged tally of customer_engagement event rows. These are
 *    REGISTRATIONS (rows), not distinct people: a person may register for several event products.
 *    (Distinct-per-product would need count(distinct), which PostgREST can't express and this
 *    sprint adds no RPC; 36 of 18,247 event people have a duplicate product row, so registrations
 *    track distinct within ~0.2%.)
 *  - unitSpread: distinct PROFILES per unit. Five units come from the MIRROR (a snapshot —
 *    engagement_<unit> > 0), so the block shows the mirror's refreshed_at. `shop` has no mirror
 *    column, so it is counted LIVE (tiny) and marked as such.
 */

export interface ContactCoverage {
  both: number;
  emailOnly: number;
  phoneOnly: number;
  neither: number;
}

export interface UnitCount {
  unit: string;
  profiles: number;
  /** "mirror" = from the snapshot (see refreshed_at); "live" = counted live (shop). */
  source: "mirror" | "live";
}

export interface ProductCount {
  product: string;
  registrations: number;
}

const PAGE = 1000;

export async function fetchContactCoverage(admin: SupabaseClient): Promise<ContactCoverage> {
  const q = () => admin.from("master_customer").select("*", { count: "exact", head: true });
  const [both, emailOnly, phoneOnly, neither] = await Promise.all([
    q().not("email_normalized", "is", null).not("phone_normalized", "is", null),
    q().not("email_normalized", "is", null).is("phone_normalized", null),
    q().is("email_normalized", null).not("phone_normalized", "is", null),
    q().is("email_normalized", null).is("phone_normalized", null),
  ]);
  for (const r of [both, emailOnly, phoneOnly, neither]) if (r.error) throw r.error;
  return {
    both: both.count ?? 0,
    emailOnly: emailOnly.count ?? 0,
    phoneOnly: phoneOnly.count ?? 0,
    neither: neither.count ?? 0,
  };
}

/** Distinct customer_ids in customer_engagement for one unit (paged dedup) — used only for the
 *  small units the mirror has no column for (shop). */
async function distinctUnit(admin: SupabaseClient, unit: string): Promise<number> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_engagement")
      .select("customer_id")
      .eq("unit", unit)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { customer_id: string }[];
    for (const r of rows) ids.add(r.customer_id);
    if (rows.length < PAGE) break;
  }
  return ids.size;
}

const MIRROR_UNIT_COL: Record<string, string> = {
  membership: "engagement_membership",
  event: "engagement_event",
  arena: "engagement_arena",
  clinic: "engagement_clinic",
  gym: "engagement_gym",
};

/** Distinct profiles per unit. Five from the mirror snapshot; `shop` (no mirror column) live. */
export async function fetchUnitSpread(admin: SupabaseClient): Promise<UnitCount[]> {
  const mirrorUnits = Object.keys(MIRROR_UNIT_COL);
  const mirrorCounts = await Promise.all(
    mirrorUnits.map((u) =>
      admin.from("crm_customer_mirror").select("*", { count: "exact", head: true }).gt(MIRROR_UNIT_COL[u], 0),
    ),
  );
  const out: UnitCount[] = [];
  mirrorUnits.forEach((u, i) => {
    if (mirrorCounts[i].error) throw mirrorCounts[i].error;
    out.push({ unit: u, profiles: mirrorCounts[i].count ?? 0, source: "mirror" });
  });
  out.push({ unit: "shop", profiles: await distinctUnit(admin, "shop"), source: "live" });
  return out.sort((a, b) => b.profiles - a.profiles);
}

/** Registrations (rows) per event product — a live paged tally. Sorted desc. */
export async function fetchEventRegistrations(admin: SupabaseClient): Promise<ProductCount[]> {
  const tally = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_engagement")
      .select("product")
      .eq("unit", "event")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { product: string | null }[];
    for (const r of rows) {
      const p = r.product ?? "(tanpa produk)";
      tally.set(p, (tally.get(p) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }
  return Array.from(tally.entries())
    .map(([product, registrations]) => ({ product, registrations }))
    .sort((a, b) => b.registrations - a.registrations);
}
