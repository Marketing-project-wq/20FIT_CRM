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
import { isEcosystemUnit, isEcosystemProduct } from "./engagement-constants";
import { isRfmValue, programByKey } from "./staging-constants";

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
  /**
   * Ecosystem presence (customer_engagement) — Sprint 3N. `ecoUnit` / `ecoProduct` match
   * a profile that has AT LEAST ONE engagement row in that unit / product. These are a
   * DIFFERENT vocabulary from `unit` (master_customer.first_unit): customer_engagement has
   * `event` and `membership` where first_unit has `20fit_data`. Still NO time criterion:
   * last_seen_at is 99,51% load-stamped, so recency here would be as dishonest as elsewhere.
   */
  ecoUnit: string | null;
  ecoProduct: string | null;
  /**
   * Unmatched-source presence (Sprint 3R), matched by normalised email. Booleans, closed by
   * construction. `srcRecency` = has a my20fit_user_activity row (real activity — only 44
   * profiles). Still NO time criterion: last_active_at is real but covers 44/82.253, so a
   * recency FILTER would look precise while hiding 99,9% of the pool (K-19). The presence
   * boolean is offered; the date is not.
   */
  srcHyrox: boolean;
  srcMy20fit: boolean;
  srcRecency: boolean;
  /**
   * Multi-source presence (TUGAS 2). `srcArena` / `srcGym` match a profile present in ANY
   * arena / gym source (email, K-06). `srcClinicPatient` / `srcClinicTxn` are CLINICAL —
   * matched phone-first — and are GATED on profile.view_health at the route: filtering
   * "clinic patient" INFERS health status from a count even with no diagnosis on screen, so
   * the route rejects them for a role without view_health (it does not silently drop them).
   * All AND-only (resolved to customer_id sets and intersected) — cross-table OR is not
   * expressible in one PostgREST query, and the UI says so rather than faking an OR.
   */
  srcArena: boolean;
  srcGym: boolean;
  srcClinicPatient: boolean;
  srcClinicTxn: boolean;
  /**
   * staging_20fit_data presence (Sprint 3Y), matched by normalised email. `srcRfm` = the RFM
   * bucket from "RFM per paid order" (closed list, misspelling `Campion user` kept verbatim).
   * `srcProgram` = a program key from STAGING_PROGRAMS (participation = value present and not
   * "-"). A program that is CLINICAL (the two "Pasien 20FIT Clinic" columns) is health-inferring
   * and GATED on profile.view_health at the route (rejected, not silently dropped). Both AND-only,
   * resolved to customer_id sets and intersected — no cross-table OR (the UI says so).
   */
  srcRfm: string | null;
  srcProgram: string | null;
  /**
   * TIME criteria (Fase 2) — resolved against crm_customer_activity, which carries REAL activity
   * timestamps (joined_at = earliest real event, last_active_at = latest) built from live source
   * tables, NOT master_customer's load-stamp columns (K-19). They apply ONLY to profiles that have
   * an activity signal (725 of the pool as of 2026-08-27); a profile with no real activity is not
   * in that table and cannot match a time filter — the honest behaviour, disclosed in the UI.
   * `joinedWithinDays` = joined ≤ N days ago (welcome). `inactiveForDays` = last active ≥ N days
   * ago (re-engagement). Null = not applied. AND-only, intersected like the other id-set criteria.
   */
  joinedWithinDays: number | null;
  inactiveForDays: number | null;
}

/** Whether any CLINICAL (health-inferring) source criterion is set — the route gates these on
 *  profile.view_health. Kept as one function so the gate and the UI can't disagree. Includes a
 *  staging program that is a clinic-patient column (being in it infers health status). */
export function hasClinicalCriteria(c: SegmentCriteria): boolean {
  const programClinical = c.srcProgram ? programByKey(c.srcProgram)?.clinical === true : false;
  return c.srcClinicPatient || c.srcClinicTxn || programClinical;
}

export const EMPTY_CRITERIA: SegmentCriteria = {
  unit: null,
  segment: null,
  city: null,
  revenue: "all",
  hasPhone: false,
  hasEmail: false,
  ecoUnit: null,
  ecoProduct: null,
  srcHyrox: false,
  srcMy20fit: false,
  srcRecency: false,
  srcArena: false,
  srcGym: false,
  srcClinicPatient: false,
  srcClinicTxn: false,
  srcRfm: null,
  srcProgram: null,
  joinedWithinDays: null,
  inactiveForDays: null,
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
  if (c.ecoUnit) n++;
  if (c.ecoProduct) n++;
  if (c.srcHyrox) n++;
  if (c.srcMy20fit) n++;
  if (c.srcRecency) n++;
  if (c.srcArena) n++;
  if (c.srcGym) n++;
  if (c.srcClinicPatient) n++;
  if (c.srcClinicTxn) n++;
  if (c.srcRfm) n++;
  if (c.srcProgram) n++;
  if (c.joinedWithinDays != null) n++;
  if (c.inactiveForDays != null) n++;
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
  // Ecosystem criteria: closed-list validated against the live customer_engagement
  // vocabulary; anything unknown falls back to "any". No free text, no time field.
  const ecoUnit = isEcosystemUnit(o.ecoUnit) ? o.ecoUnit : null;
  const ecoProduct = isEcosystemProduct(o.ecoProduct) ? (o.ecoProduct as string) : null;
  // staging_20fit_data criteria: RFM is a closed value list; program is a known program key.
  // Both fall back to null (any) when unknown — no free text, no time field.
  const srcRfm = isRfmValue(o.srcRfm) ? (o.srcRfm as string) : null;
  const srcProgram = typeof o.srcProgram === "string" && programByKey(o.srcProgram) ? o.srcProgram : null;
  // TIME criteria: positive integer days, capped at 3650 (10y) to bound the value. Anything
  // else (0, negative, non-number, absurd) → null (not applied). No date passes through — only
  // a day-count, resolved against real activity timestamps server-side.
  const joinedWithinDays = clampDays(o.joinedWithinDays);
  const inactiveForDays = clampDays(o.inactiveForDays);
  return {
    unit,
    segment,
    city,
    revenue,
    hasPhone: o.hasPhone === true,
    hasEmail: o.hasEmail === true,
    ecoUnit,
    ecoProduct,
    srcHyrox: o.srcHyrox === true,
    srcMy20fit: o.srcMy20fit === true,
    srcRecency: o.srcRecency === true,
    srcArena: o.srcArena === true,
    srcGym: o.srcGym === true,
    srcClinicPatient: o.srcClinicPatient === true,
    srcClinicTxn: o.srcClinicTxn === true,
    srcRfm,
    srcProgram,
    joinedWithinDays,
    inactiveForDays,
  };
}

/** A time criterion is a positive whole number of days, capped at 3650 (10y). Anything else → null. */
function clampDays(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return Math.min(n, 3650);
}

export { SEGMENT_NULL };
