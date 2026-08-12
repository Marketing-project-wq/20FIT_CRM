/**
 * Constants + PURE helpers for the `staging_20fit_data` import source (Sprint 3Y). Client-safe:
 * the profile UI and /quality import the column registry, program list, RFM values, and the
 * date parser. The service-role query code lives in lib/crm/staging.ts (server-only). Same split
 * as multisource-constants.ts / staging.ts.
 *
 * WHY THIS SOURCE MATTERS: it is the SAME import as master_customer and matches almost perfectly
 * by email (81.079 / 82.253 = 98,6%, measured 12 Agu 2026). It carries a birth date (5.439
 * matched profiles) that the initial import dropped from master_customer entirely (0% filled),
 * plus program participation and an RFM label — the fields that make the dashboard non-empty.
 *
 * SECURITY (T-02): staging_20fit_data is RLS OFF — its contents are already reachable by anyone
 * holding the anon key, WITHOUT logging in. Reading it here via the service role does NOT widen
 * exposure; it gives the data a gated, audited path (the profile read is audited, clinic-adjacent
 * program flags are health-gated). That is not licence to be loose: the columns read are pinned
 * to the SAFE lists below and a guard test (staging-constants.test.ts) asserts they never overlap
 * the FORBIDDEN identity columns.
 *
 * ZERO write, ZERO copy into master_customer / crm_*. Read + join at display time — a copy would
 * go stale, and Fase 0 (ingestion hold) is not lifted.
 *
 * COLUMN NAMES have spaces, dots and a slash ("Tgl / Tahun lahir", "Sportfest v.02 Single",
 * "Mandiri RUNFEST 2.7K"). They MUST be double-quoted in PostgREST. They are pinned ONCE in the
 * maps below; query code quotes whole names from these maps and never assembles a column name by
 * string concatenation (larangan).
 */

export const STAGING_TABLE = "staging_20fit_data";

/** Non-program physical columns, pinned once. Internal clean key → physical (unquoted) name. */
export const STAGING_COLUMNS = {
  email: "Email",
  city: "City",
  dob: "Tgl / Tahun lahir",
  umur: "Umur",
  rfmPaidOrder: "RFM per paid order",
  rfmRevenue: "RFM per revenue",
} as const;

/**
 * Identity columns we match on but NEVER re-display — re-showing them is a redundant mini
 * contact-export (same rule as MULTISOURCE_FORBIDDEN_COLUMNS). The guard test asserts every
 * safe/displayed column is disjoint from this set.
 */
export const STAGING_FORBIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  "Name",
  "Email",
  "Numberphone",
  "Number phone 62",
]);

export interface ProgramDef {
  /** Stable clean id for the UI + registry lookups. */
  key: string;
  /** Human label shown on screen. */
  label: string;
  /** Physical column name (quoted at query time). */
  column: string;
  /**
   * CLINICAL = being in this column INFERS health status (clinic patient). Gated on
   * profile.view_health everywhere: server-omitted from the profile for other roles, and
   * rejected (not silently dropped) as a segment criterion — same rule as the clinic source.
   */
  clinical: boolean;
}

/**
 * Every program column in staging_20fit_data (positions 9–36). `Arena`, `GYM`, `Paid Shop` are
 * entirely empty (measured 0, 12 Agu 2026) — kept in the registry on purpose so /quality shows
 * them as a measured zero (K-08); their emptiness is itself a finding, not a row to drop.
 */
export const STAGING_PROGRAMS: readonly ProgramDef[] = [
  { key: "fitco_user", label: "Fitco User", column: "Fitco User", clinical: false },
  { key: "sportfest_half", label: "Sportfest v.02 Half", column: "Sportfest v.02 Half", clinical: false },
  { key: "sportfest_relay", label: "Sportfest v.02 Relay", column: "Sportfest v.02 Relay", clinical: false },
  { key: "sportfest_double", label: "Sportfest v.02 Double", column: "Sportfest v.02 Double", clinical: false },
  { key: "sportfest_single", label: "Sportfest v.02 Single", column: "Sportfest v.02 Single", clinical: false },
  { key: "training_session", label: "Training Session", column: "Training Session", clinical: false },
  { key: "physio_massage", label: "Physio / Sports Massage", column: "Physio or Sports Massage", clinical: false },
  { key: "protection", label: "Protection", column: "Protection", clinical: false },
  { key: "clinic_2024_2025", label: "Pasien 20FIT Clinic 2024–2025", column: "Pasien 20FIT Clinic 2024-2025", clinical: true },
  { key: "clinic_2025_2026", label: "Pasien 20FIT Clinic 2025–2026", column: "Pasien 20FIT Clinic 2025-2026", clinical: true },
  { key: "paid_shop", label: "Paid Shop", column: "Paid Shop", clinical: false },
  { key: "arena", label: "Arena", column: "Arena", clinical: false },
  { key: "gym", label: "GYM", column: "GYM", clinical: false },
  { key: "padel", label: "Padel rabel", column: "Padel rabel", clinical: false },
  { key: "jhm_2025_5k", label: "Jhm 2025 · 5k", column: "Jhm 2025 - 5k", clinical: false },
  { key: "jhm_2025_10k", label: "Jhm 2025 · 10K", column: "Jhm 2025 - 10K", clinical: false },
  { key: "jhm_2025_hm", label: "Jhm 2025 · HM", column: "Jhm 2025 - HM", clinical: false },
  { key: "jhm_2024_5k", label: "Jhm 2024 · 5k", column: "Jhm 2024 - 5k", clinical: false },
  { key: "jhm_2024_10k", label: "Jhm 2024 · 10K", column: "Jhm 2024 - 10K", clinical: false },
  { key: "jhm_2024_hm", label: "Jhm 2024 · HM", column: "Jhm 2024 - HM", clinical: false },
  { key: "iwhm_2025_5k", label: "Iwhm 2025 · 5k", column: "Iwhm 2025 - 5k", clinical: false },
  { key: "iwhm_2025_10k", label: "Iwhm 2025 · 10k", column: "Iwhm 2025 - 10k", clinical: false },
  { key: "iwhm_2025_21k", label: "Iwhm 2025 · 21k", column: "Iwhm 2025 - 21k", clinical: false },
  { key: "raya_2025_5k", label: "Raya run 2025 · 5k", column: "Raya run 2025 - 5k", clinical: false },
  { key: "raya_2025_10k", label: "Raya run 2025 · 10k", column: "Raya run 2025 - 10k", clinical: false },
  { key: "runfest_27k", label: "Mandiri RUNFEST 2.7K", column: "Mandiri RUNFEST 2.7K", clinical: false },
  { key: "runfest_5k", label: "Mandiri RUNFEST 5K", column: "Mandiri RUNFEST 5K", clinical: false },
  { key: "runfest_10k", label: "Mandiri RUNFEST 10K", column: "Mandiri RUNFEST 10K", clinical: false },
] as const;

/** Lookup a program by its clean key. */
export function programByKey(key: string): ProgramDef | undefined {
  return STAGING_PROGRAMS.find((p) => p.key === key);
}

/**
 * RFM ("RFM per paid order") closed value list. `-` means "no bucket" and is NOT offered as a
 * criterion (it is the absence of a value, not a segment). The stored misspelling `Campion user`
 * is kept VERBATIM — "correcting" it to `Champion` would make the filter no longer match what is
 * stored (larangan). `RFM per revenue` is 0% filled (measured 12 Agu 2026) and is not offered.
 */
export const STAGING_RFM_VALUES = [
  "Campion user",
  "Loyal user",
  "New User",
  "Potensial user",
] as const;
export type StagingRfmValue = (typeof STAGING_RFM_VALUES)[number];

export function isRfmValue(v: unknown): v is StagingRfmValue {
  return typeof v === "string" && (STAGING_RFM_VALUES as readonly string[]).includes(v);
}

/** A program column value counts as PARTICIPATION when it is present and not the `-` sentinel.
 *  `-` = explicitly not in the program; NULL = no data. The two are never conflated (larangan). */
export function isParticipation(value: string | null | undefined): boolean {
  return value != null && value.trim() !== "" && value.trim() !== "-";
}

// ── Birth-date parsing ──────────────────────────────────────────────────────────────────────
//
// staging_20fit_data."Tgl / Tahun lahir" is TEXT. Measured 12 Agu 2026: all 5.467 filled values
// are ISO `yyyy-mm-dd`, and 0 have a month field > 12 — so, unlike cf_hyrox_participants (321
// day/month-swapped rows, T-16), there is NO provably-swapped row here. But 2.232 values have
// BOTH the month and day fields ≤ 12: for those the stored order cannot be verified from the
// value alone, so they are FLAGGED ambiguous, never silently trusted or "corrected".
//
// The `Umur` column cannot resolve the ambiguity: swapping day and month keeps the same birth
// YEAR, so age is unchanged — Umur validates the year (0 rows off by ≥2 years at the snapshot),
// not the day/month. Umur is therefore a year cross-check only, and it is a STALE snapshot
// (20 Apr 2026); the displayed age is always recomputed from the date, never taken from Umur.

/** Plausible-age window for a fitness customer base. Outside it, the date is FLAGGED, not dropped. */
export const STAGING_MIN_AGE = 10;
export const STAGING_MAX_AGE = 100;

/** The date `Umur` was snapshotted at import (all 88.536 rows share created_at 2026-04-20). Used
 *  ONLY to cross-check the birth YEAR against Umur — never as a live "recency" signal (K-19). */
export const STAGING_UMUR_SNAPSHOT = "2026-04-20";

export type DobStatus = "empty" | "unparseable" | "parsed";
export type DobPlausibility = "ok" | "future" | "too_old" | "too_young";

export interface DobParse {
  status: DobStatus;
  /** The trimmed source string, echoed back for provenance. */
  raw: string | null;
  /** Canonical yyyy-mm-dd — present only when status === "parsed". */
  iso: string | null;
  year: number | null;
  month: number | null;
  day: number | null;
  /** month field ≤ 12 AND day field ≤ 12 → order unverifiable from the value. Flag, don't guess. */
  ambiguousDayMonth: boolean;
  /** month field > 12 → the value was stored day-first; we read it back correctly and flag it. */
  swapped: boolean;
  /** Age-range plausibility (needs `today`); null when `today` was not supplied to the parser. */
  plausibility: DobPlausibility | null;
}

function empty(raw: string | null): DobParse {
  return {
    status: "empty", raw, iso: null, year: null, month: null, day: null,
    ambiguousDayMonth: false, swapped: false, plausibility: null,
  };
}
function unparseable(raw: string | null): DobParse {
  return {
    status: "unparseable", raw, iso: null, year: null, month: null, day: null,
    ambiguousDayMonth: false, swapped: false, plausibility: null,
  };
}

/** Whether y-m-d is a real calendar date (rejects 31 Feb, 30 Feb, etc.). */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() + 1 === month && dt.getUTCDate() === day;
}

/** Whole-year age of `iso` as of `today` (both yyyy-mm-dd interpreted in UTC). null if unparseable. */
export function ageFromIso(iso: string | null, today: Date): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!isRealDate(y, m, d)) return null;
  let age = today.getUTCFullYear() - y;
  const beforeBirthday =
    today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Parse a staging birth-date string. PURE. Only the ISO `yyyy-mm-dd` shape is accepted (the only
 * shape present); anything else is `unparseable` (flagged, never a silent drop). When `today` is
 * supplied, plausibility is filled from the age window. Day/month ambiguity and the (theoretical)
 * day-first swap are surfaced as flags — the caller decides how to show them, this never guesses.
 */
export function parseStagingDob(raw: string | null | undefined, today?: Date): DobParse {
  if (raw == null) return empty(null);
  const s = String(raw).trim();
  if (s === "") return empty(null);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!iso) return unparseable(s);

  const year = parseInt(iso[1], 10);
  const f2 = parseInt(iso[2], 10); // month slot
  const f3 = parseInt(iso[3], 10); // day slot

  let month = f2;
  let day = f3;
  let swapped = false;
  let ambiguousDayMonth = false;

  if (f2 > 12 && f3 > 12) {
    return unparseable(s); // neither field can be a month
  } else if (f2 > 12 && f3 <= 12) {
    // Month slot holds a day → the value was written day-first. Read it back correctly, flag it.
    month = f3;
    day = f2;
    swapped = true;
  } else if (f2 <= 12 && f3 <= 12) {
    // Both fields are valid months → the stored order cannot be verified. Keep it, flag it.
    ambiguousDayMonth = true;
  }

  if (!isRealDate(year, month, day)) return unparseable(s);

  const canonical = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  let plausibility: DobPlausibility | null = null;
  if (today) {
    const age = ageFromIso(canonical, today);
    if (age == null) plausibility = "ok";
    else if (age < 0) plausibility = "future";
    else if (age < STAGING_MIN_AGE) plausibility = "too_young";
    else if (age > STAGING_MAX_AGE) plausibility = "too_old";
    else plausibility = "ok";
  }

  return { status: "parsed", raw: s, iso: canonical, year, month, day, ambiguousDayMonth, swapped, plausibility };
}
