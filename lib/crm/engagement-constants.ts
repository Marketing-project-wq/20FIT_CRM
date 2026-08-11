/**
 * Constants + PURE helpers for the 20FIT ecosystem read layer (customer_engagement).
 *
 * NOT `server-only`: the client segment builder and the profile-detail component both
 * import the vocabulary and the last_seen classifier. The service-role query code lives
 * in lib/crm/engagement.ts, which IS server-only. Same split as audience-constants.ts /
 * quality-types.ts.
 *
 * customer_engagement is an EXISTING table (90.419 rows) read in place — Sprint 3N adds
 * NO schema, NO ingestion, and copies NOTHING into crm_*. The vocabulary below is the
 * live unit/product breakdown verified 11 Agustus 2026; it is intentionally its OWN list
 * and NOT reused from AUDIENCE_UNITS, because the two tables disagree: customer_engagement
 * has `event` and `membership` where master_customer.first_unit has `20fit_data`.
 */

/** The six units present in customer_engagement (verified 11 Agu 2026). Distinct from
 *  AUDIENCE_UNITS on purpose — see the module header. */
export const ECOSYSTEM_UNITS = ["arena", "clinic", "event", "gym", "membership", "shop"] as const;
export type EcosystemUnit = (typeof ECOSYSTEM_UNITS)[number];

/**
 * The 25 products, grouped by unit, as they appear in customer_engagement (verified
 * 11 Agu 2026). Order within a unit is by row-count desc so the segment builder lists
 * the biggest cohorts first. This is a VOCABULARY for closed-list validation and for
 * grouping the <select>; it is not a source of counts (counts are computed live).
 */
export const ECOSYSTEM_PRODUCTS_BY_UNIT: Record<EcosystemUnit, readonly string[]> = {
  arena: ["Padel", "Transaksi Arena"],
  clinic: ["Transaksi Clinic", "Clinic Patient", "Training Session", "Physio or Sports Massage"],
  event: [
    "Mandiri RUNFEST 5K",
    "JHM 5K",
    "JHM 10K",
    "JHM HM",
    "IWHM 5K",
    "IWHM 10K",
    "Raya Run 5K",
    "Raya Run 10K",
    "Mandiri RUNFEST 10K",
    "Mandiri RUNFEST 2.7K",
    "IWHM 21K",
    "Sportfest v.02 Double",
    "Sportfest v.02 Half",
    "Sportfest v.02 Single",
    "Sportfest v.02 Relay",
  ],
  gym: ["Transaksi Gym"],
  membership: ["Fitco User"],
  shop: ["Protection", "Transaksi Shop"],
} as const;

/** Flat list of all 25 products — the closed list for parseCriteria validation. */
export const ECOSYSTEM_PRODUCTS: readonly string[] = Object.values(ECOSYSTEM_PRODUCTS_BY_UNIT).flat();

export function isEcosystemUnit(v: unknown): v is EcosystemUnit {
  return typeof v === "string" && (ECOSYSTEM_UNITS as readonly string[]).includes(v);
}

export function isEcosystemProduct(v: unknown): boolean {
  return typeof v === "string" && ECOSYSTEM_PRODUCTS.includes(v);
}

/**
 * How to read a single customer_engagement row's `last_seen_at` (K-19). This is the ONE
 * rule the profile screen and the quality screen both use, expressed as a pure function
 * so it is testable and can never diverge between screens.
 *
 *   - "future_anomaly": last_seen_at is in the FUTURE. A date that hasn't happened cannot
 *     be a real activity; it is a data defect (1 row on 11 Agu 2026: 2026-12-05). Checked
 *     FIRST so a future date is never mistaken for "recent activity".
 *   - "real_activity": last_seen_at is strictly LATER than first_seen_at (and not future).
 *     THIS is the only case that carries a real activity date — show it. (444 rows on
 *     11 Agu, all in live_txn_sync: Transaksi Arena + Transaksi Clinic.)
 *   - "load_stamp": last_seen_at EQUALS first_seen_at (or is not after it). No activity
 *     was recorded past the load instant — the value is a load stamp, NOT "terakhir aktif".
 *     Must be shown as "tidak terekam", never as a date and never as a bare em-dash.
 *     (89.974 rows on 11 Agu = 99,51% of the table.)
 *   - "missing": last_seen_at is null/unparseable (0 rows today, but the code is honest
 *     about the shape rather than assuming).
 *
 * `nowMs` is injected (not read inside) so the function stays pure and testable.
 */
export type LastSeenClass = "real_activity" | "load_stamp" | "future_anomaly" | "missing";

export function classifyLastSeen(
  firstSeenAt: string | null | undefined,
  lastSeenAt: string | null | undefined,
  nowMs: number,
): LastSeenClass {
  if (lastSeenAt == null) return "missing";
  const lastMs = Date.parse(lastSeenAt);
  if (Number.isNaN(lastMs)) return "missing";
  if (lastMs > nowMs) return "future_anomaly";
  if (firstSeenAt != null) {
    const firstMs = Date.parse(firstSeenAt);
    if (!Number.isNaN(firstMs) && lastMs > firstMs) return "real_activity";
  }
  return "load_stamp";
}
