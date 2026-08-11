/**
 * Display-name tidying — a PURE function applied at the DISPLAY layer only (Sprint 3P).
 *
 * master_customer is READ-ONLY (Sprint 2) and shared with other systems, so names are NEVER
 * rewritten in the database — they are tidied when shown. The ORIGINAL is always kept and
 * shown beside the tidy version, and SEARCH runs over the source column, not this output
 * (see lib/crm/search-read.ts): tidying must never make a real name unfindable.
 *
 * Postgres `initcap()` and a naive `.toUpperCase()` both mangle Indonesian names. This
 * handles, deliberately:
 *   - honorifics/titles: `H.`, `Hj.`, `Drs.`, `Ir.`, `S.Pd`, `M.M.` keep their usual form;
 *     `dr.` (medical) stays lowercase on purpose — it is not a typo.
 *   - initials: `A.M. Rizki`, never `A.m. Rizki`.
 *   - particles: `bin`, `binti`, `van`, `de` stay lowercase between names.
 *   - hyphens & apostrophes: `Nur-Aini`, `D'Souza` capitalised on BOTH sides.
 *   - doubled / edge whitespace: collapsed.
 * Names containing digits are NOT "fixed" here — they are tidied for display like any other
 * string, and flagged as an anomaly in /quality (like negative LTV). Flag, don't guess.
 */

/** Titles that stay lowercase (medical `dr.`). Matched on the token minus any trailing dot. */
const LOWERCASE_TITLES = new Set(["dr"]);

/** Particles that stay lowercase when they sit BETWEEN names (not as the first token). */
const PARTICLES = new Set(["bin", "binti", "bt", "van", "de", "der", "den", "al", "el"]);

/** Capitalise the first letter of each alphabetic run, lowercasing the rest. Splitting on
 *  non-letters means initials (`a.m.`→`A.M.`), hyphens (`nur-aini`→`Nur-Aini`) and
 *  apostrophes (`d'souza`→`D'Souza`) all fall out of ONE rule. Unicode-aware. */
function capitalizeRuns(token: string): string {
  // Latin + Latin-1 letters (covers Indonesian ASCII names and common accents) without the
  // es2018 `\p{L}`/`u`-flag requirement. Each maximal letter run is title-cased.
  return token.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g, (w) => w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase());
}

function formatToken(token: string, isFirst: boolean): string {
  const lower = token.toLocaleLowerCase();
  const bare = lower.replace(/\.+$/, "");
  // Medical/lowercase titles keep their lowercase form (e.g. `dr.`).
  if (LOWERCASE_TITLES.has(bare)) return lower;
  // Particles stay lowercase between names, but a name that STARTS with one is capitalised.
  if (!isFirst && PARTICLES.has(bare)) return lower;
  return capitalizeRuns(token);
}

/**
 * Tidy a name for display. Returns null for null/blank input (so callers can fall back to
 * "Tanpa nama"). Collapses whitespace, then formats each token. Idempotent on already-tidy
 * input.
 */
export function formatDisplayName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed === "") return null;
  return collapsed
    .split(" ")
    .map((tok, i) => formatToken(tok, i === 0))
    .join(" ");
}

/** True when a name contains a digit — almost certainly junk data. Used to FLAG (not fix)
 *  in /quality. Pure so it is testable. */
export function nameHasDigit(raw: string | null | undefined): boolean {
  return typeof raw === "string" && /\d/.test(raw);
}

/** True when tidying would visibly change the name — i.e. the source is messy. Lets the UI
 *  show the original beside the tidy form only when they actually differ. */
export function nameNeedsTidy(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const tidy = formatDisplayName(raw);
  return tidy != null && tidy !== raw;
}
