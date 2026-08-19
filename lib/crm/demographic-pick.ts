/**
 * DEMOGRAPHIC PRIORITY CHAIN — PURE, client-safe (Sprint NIK-2, K-31). ONE place that turns the
 * several birth-date / gender sources a profile can carry into a SINGLE chosen value with
 * provenance, plus the OTHER sources that DISAGREE — so the conflict stays findable while the
 * screen shows one value, not two side by side (the Sprint 3S "show both" default is retired for
 * the CS tool: two dates on one row push the decision onto staff mid-call).
 *
 * The priority ORDER lives HERE, not in the caller, so it cannot be reordered per screen. Read
 * WHY before touching it:
 *
 *   1. NIK-derived — the digit positions are FIXED (7–8 day, 9–10 month), so a NIK has ZERO
 *      day/month ambiguity, unlike every other source. Only its 2-digit year needs a century
 *      rule. That makes it the most reliable WHEN IT PARSES — not because anyone asked for NIK
 *      first, but because it is structurally unambiguous.
 *   2. staging_20fit_data — ISO text, 5.467 rows, no proven swaps.
 *   3. clinic_patients, then cf_hyrox_participants — the WEAKEST: 321 Hyrox rows have day/month
 *      SWAPPED vs the NIK (an import parse bug, same class as T-16). Clinic is ordered before
 *      Hyrox because Hyrox is the proven-swapped one.
 *   4. staff entry (crm_profile_demographic) — present only when every other source was empty
 *      (its write path is fill-empty-only), so it is the last resort by construction.
 *
 * A NIK that cannot be parsed (wrong length, bad month, dummy) yields no date and simply DROPS to
 * the next source — it is never forced. Ambiguity that survives onto the chosen value (NIK: the
 * century; other sources: day/month order) is carried out on `ambiguous` so the caller can keep
 * the flag visible: choosing one value does not make it certain.
 *
 * Province is deliberately NOT in this chain: the NIK province is the KTP ISSUANCE place, while a
 * city from master/staging is DOMICILE — different fields, kept separate with their own labels.
 */

export type DobSource = "nik" | "staging" | "clinic" | "hyrox" | "staff";

/** Canonical birth-date priority. Do not reorder — see the reasoning in the file header. */
export const DOB_PRIORITY: readonly DobSource[] = ["nik", "staging", "clinic", "hyrox", "staff"];

export interface DobInput {
  /** yyyy-mm-dd, or null when this source has no usable date. */
  iso: string | null;
  /** Ambiguity that should stay visible if this value is the one chosen. */
  ambiguous?: boolean;
}

export interface DobPick {
  iso: string | null;
  source: DobSource | null;
  /** The chosen value's own ambiguity flag (NIK → century; staging → day/month order). */
  ambiguous: boolean;
  /** Other sources that carry a usable date DIFFERENT from the chosen one — for the conflict cue. */
  conflicts: { source: DobSource; iso: string }[];
}

/**
 * Choose one birth date from the available sources, in canonical priority order, and report which
 * other sources disagree. Pure: the caller passes already-extracted `{iso, ambiguous}` per source.
 */
export function pickBirthDate(bySource: Partial<Record<DobSource, DobInput | null>>): DobPick {
  let chosen: { source: DobSource; iso: string; ambiguous: boolean } | null = null;
  const usable: { source: DobSource; iso: string }[] = [];
  for (const s of DOB_PRIORITY) {
    const v = bySource[s];
    if (v && v.iso) {
      usable.push({ source: s, iso: v.iso });
      if (!chosen) chosen = { source: s, iso: v.iso, ambiguous: !!v.ambiguous };
    }
  }
  if (!chosen) return { iso: null, source: null, ambiguous: false, conflicts: [] };
  const picked = chosen;
  const conflicts = usable.filter((u) => u.source !== picked.source && u.iso !== picked.iso);
  return { iso: picked.iso, source: picked.source, ambiguous: picked.ambiguous, conflicts };
}

export type GenderValue = "male" | "female";
export type GenderSource = "nik" | "clinic" | "staff";

/** Canonical gender priority — same reasoning as the date chain: NIK first because the gender
 *  digit is structural (day-code > 40 = female), staff last (fill-empty-only). staging carries no
 *  gender column, so it is not a source here. */
export const GENDER_PRIORITY: readonly GenderSource[] = ["nik", "clinic", "staff"];

export interface GenderPick {
  value: GenderValue | null;
  source: GenderSource | null;
  conflicts: { source: GenderSource; value: GenderValue }[];
}

/** Normalise a free-text or coded gender to male/female (or null). Pure. */
export function normalizeGender(raw: string | null | undefined): GenderValue | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (["male", "m", "laki-laki", "laki laki", "laki", "pria", "l"].includes(s)) return "male";
  if (["female", "f", "perempuan", "wanita", "p"].includes(s)) return "female";
  return null;
}

/** Choose one gender from the available sources, in canonical priority order, reporting disagreement. */
export function pickGender(bySource: Partial<Record<GenderSource, GenderValue | null>>): GenderPick {
  let chosen: { source: GenderSource; value: GenderValue } | null = null;
  const usable: { source: GenderSource; value: GenderValue }[] = [];
  for (const s of GENDER_PRIORITY) {
    const v = bySource[s] ?? null;
    if (v) {
      usable.push({ source: s, value: v });
      if (!chosen) chosen = { source: s, value: v };
    }
  }
  if (!chosen) return { value: null, source: null, conflicts: [] };
  const picked = chosen;
  const conflicts = usable.filter((u) => u.source !== picked.source && u.value !== picked.value);
  return { value: picked.value, source: picked.source, conflicts };
}
