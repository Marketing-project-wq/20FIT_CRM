/**
 * Translation SAFEGUARDS for data-quality warnings (Sprint 4C). The key-parity test catches a
 * MISSING key; it cannot catch a translation that is technically present but weaker in meaning —
 * the real risk of translating the warning-heavy deep screens. These two guards catch that, and
 * both live HERE (one place, with reasons) so a future translator sees why the rule exists.
 *
 * WHICH KEYS ARE WARNINGS: any dictionary leaf whose dotted path contains ".warn." Warning
 * sentences are deliberately placed under a `warn` sub-object per screen (e.g. quality.warn.*),
 * so short labels/titles/headers are NOT subject to these guards — only the load-bearing prose.
 */

export function isWarningKey(dottedPath: string): boolean {
  return dottedPath.includes(".warn.");
}

/**
 * FORBIDDEN English phrases in a warning value — decisions carried from 4B and extended in 4C.
 * Each is a phrase that is grammatically fine but DROPS the nuance the Indonesian carries. The
 * check is word-boundary so it can't false-positive on a substring.
 */
export const FORBIDDEN_EN_WARNING_TERMS: readonly { term: string; reason: string }[] = [
  {
    term: "no data",
    reason:
      '"tidak terekam" must become "not recorded", never "no data": the date/value EXISTS, it just is not activity — "no data" hides that.',
  },
  {
    term: "date added",
    reason:
      '"cap muat / load timestamp" must never become "date added": "date added" re-asserts the exact claim (that it means when the row was added as a real event) that the warning refutes.',
  },
  {
    term: "unavailable",
    reason:
      '"tidak ada sumber data" must become "no data source exists", never "unavailable": "unavailable" sounds temporary, but there is simply no source.',
  },
  {
    term: "empty",
    reason:
      '"belum terisi" must become "not filled in", never "empty": "empty" reads like a measured zero, which is a different (K-08) claim.',
  },
  {
    term: "invalid",
    reason:
      '"ambigu — tidak bisa dipastikan" must not become "invalid": the value is present and valid, only the day/month ORDER is unverifiable.',
  },
] as const;

/**
 * Minimum ratio of English warning length to Indonesian warning length. English is naturally
 * terser, so a floor of 0.5 does NOT flag normal terseness — it flags a warning that has lost a
 * whole clause (typically its "why"), which drops well over half the characters. This is a coarse
 * truncation detector, not a quality score. Keys that are legitimately much shorter in English are
 * listed in WARNING_LENGTH_EXCEPTIONS with a note, so the exception is explicit, never silent.
 */
export const WARNING_LENGTH_RATIO_MIN = 0.5;

/** Dotted warning keys allowed to be shorter than the ratio, each with the reason it's fine. */
export const WARNING_LENGTH_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  // (none yet — add "screen.warn.key" -> "why this English is legitimately short" as needed)
]);
