/**
 * Segment BUILDER criteria — pure, client-safe (the /segments UI and the /api/segments
 * route both import it, so the two can't disagree about what a criterion is).
 *
 * Sprint 3M builds, counts, and DISCARDS segment definitions — no table, no save, no
 * segment name. Storage is a separate decision (docs/RENCANA-simpan-segmen.md).
 *
 * TIME-BASED CRITERIA ARE ABSENT ON PURPOSE (K-19). Every time column in master_customer
 * is a load stamp: `created_at` and `first_seen_at` are one instant per source, and
 * `last_activity_at` is banned since Sprint 2. Recency segmentation cannot be honest with
 * this data, and offering the box invites people to use it. The UI says why — it does not
 * merely omit the option.
 */
import { SEGMENT_NULL, capFilterValue, FILTER_VALUE_MAX } from "./audience-constants";

export type RevenueCriterion = "all" | "has" | "none" | "negative";

export function isRevenueCriterion(v: unknown): v is RevenueCriterion {
  return v === "all" || v === "has" || v === "none" || v === "negative";
}

/** A segment definition — only columns that actually carry information (PRD data reality). */
export interface SegmentCriteria {
  /** first_unit exact match, or null for any. */
  unit: string | null;
  /** segment exact match, SEGMENT_NULL for the NULL cohort, or null for any. */
  segment: string | null;
  /** city ilike contains — WARNING: 93% of rows have no city (see cityFill note in UI). */
  city: string | null;
  /** lifetime_value bucket. `negative` is the single T-10 anomaly row. */
  revenue: RevenueCriterion;
  hasPhone: boolean;
  hasEmail: boolean;
}

export const EMPTY_CRITERIA: SegmentCriteria = {
  unit: null,
  segment: null,
  city: null,
  revenue: "all",
  hasPhone: false,
  hasEmail: false,
};

/** How many criteria are actively narrowing the pool (0 = whole pool). */
export function activeCriteriaCount(c: SegmentCriteria): number {
  let n = 0;
  if (c.unit) n++;
  if (c.segment) n++;
  if (c.city && c.city.trim() !== "") n++;
  if (c.revenue !== "all") n++;
  if (c.hasPhone) n++;
  if (c.hasEmail) n++;
  return n;
}

/**
 * Parse an untrusted body into a SegmentCriteria. Closed-list values are validated;
 * unknown values fall back to "any". City is free text — trimmed and length-capped here
 * (K-17), since it lands in audit metadata. NEVER accepts a time-based field: there is no
 * parameter to pass one through.
 */
export function parseCriteria(raw: unknown): SegmentCriteria {
  const o = (raw ?? {}) as Record<string, unknown>;
  const unit = typeof o.unit === "string" && o.unit.trim() !== "" ? o.unit : null;
  const segment =
    typeof o.segment === "string" && o.segment.trim() !== "" ? o.segment : null;
  const cityRaw = typeof o.city === "string" ? o.city.trim() : "";
  const city = cityRaw === "" ? null : capFilterValue(cityRaw, FILTER_VALUE_MAX).value;
  const revenue = isRevenueCriterion(o.revenue) ? o.revenue : "all";
  return {
    unit,
    segment,
    city,
    revenue,
    hasPhone: o.hasPhone === true,
    hasEmail: o.hasEmail === true,
  };
}

export { SEGMENT_NULL };
