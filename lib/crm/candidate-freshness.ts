/**
 * "How old is the candidate data?" — a PURE staleness judgement for the dashboard's candidate card.
 *
 * THE BUG THIS EXISTS TO KILL (a silent-failure example, see TEMUAN.md). crm_identity_candidate was
 * populated ONCE (a single backfill batch — every row's first_seen_at is the same instant) and no
 * pipeline feeds it. But the nightly precompute RE-COUNTS that frozen table every night and stamps
 * the result with the mirror's refresh time (today). So the candidate card printed a number that had
 * not moved in weeks under a "snapshot · <today>" tag — it LOOKED live and overstated the real,
 * still-growing gap several times over. The count is not wrong; the freshness label was.
 *
 * The fix is display-only: judge the candidate data by ITS OWN age — the newest first_seen_at in the
 * table (fetchCandidateAsOf) — not by when a COUNT last ran. This helper turns that "as of" instant
 * into the card's verdict. No migration, no change to the nightly computation; the count still comes
 * from the precompute exactly as before.
 *
 * NOW-AS-ARGUMENT (K-63): `nowMs` is passed in for the decision, never read from a clock in here, so
 * the judgement is deterministic and testable and the component keeps a single source of "now".
 */

/**
 * Older than this many whole days ⇒ the candidate data is FROZEN, not a fresh snapshot. Chosen
 * against the nightly cadence: were anything feeding the table, the newest row would never be a week
 * old. A week of no movement is the signal, so the card stops calling it a snapshot and says
 * "beku sejak <date>" instead. One threshold, defined once, beside the data it judges.
 */
export const CANDIDATE_STALE_DAYS = 7;

export interface CandidateFreshness {
  /** The data's own "as of" instant — the newest first_seen_at — echoed back (null when unknown). */
  asOf: string | null;
  /** Whole days from asOf to now. null when asOf is absent or unparseable (never a fake 0). */
  ageDays: number | null;
  /** asOf is known AND older than CANDIDATE_STALE_DAYS ⇒ show the frozen-since warning. */
  isStale: boolean;
}

/**
 * Judge candidate-data freshness from its newest row's timestamp. Pure. A null/unparseable `asOf`
 * yields ageDays null and isStale false — "we could not measure the age" is NOT "it is fresh" and is
 * NOT "it is stale": the card simply omits the verdict rather than inventing one. A future asOf
 * (clock skew) is a non-negative-age edge that reads as not-stale, never a negative day count on
 * screen.
 */
export function candidateFreshness(asOf: string | null, nowMs: number): CandidateFreshness {
  if (!asOf) return { asOf: null, ageDays: null, isStale: false };
  const t = parseTimestamp(asOf);
  if (t === null) return { asOf, ageDays: null, isStale: false };
  const ageDays = Math.max(0, Math.floor((nowMs - t) / 86_400_000));
  return { asOf, ageDays, isStale: ageDays > CANDIDATE_STALE_DAYS };
}

/**
 * Parse a Postgres timestamptz string to epoch ms, robust to the shapes it can arrive in — so this
 * staleness fix can NEVER be silently inert on a format quirk (which would be the very bug it exists
 * to kill). PostgREST serialises as ISO with a `+00:00` offset (Date.parse handles it), but a bare
 * two-digit offset (`…+00`, `…+07`) is NOT valid ISO and Date.parse returns NaN for it — so a
 * trailing `[+-]HH` with no minutes is padded to `[+-]HH:00` first. Returns null on a value no amount
 * of normalising makes a date (the caller then shows the count with no freshness verdict).
 */
function parseTimestamp(raw: string): number | null {
  const normalised = raw.trim().replace(/([+-]\d{2})$/, "$1:00");
  const t = Date.parse(normalised);
  return Number.isNaN(t) ? null : t;
}
