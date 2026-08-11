/**
 * Email typo DETECTION — pure, client-safe (Sprint 3P, TUGAS 5).
 *
 * This module only ever SUGGESTS. It NEVER corrects: changing someone's email on a guess
 * can send their personal data to a different person, and that harm cannot be undone. The
 * output is a flag + a suggestion + a confidence; a human confirms per row (a real write
 * path, planned in docs/RENCANA-koreksi-kontak.md, NOT built here).
 *
 * Legit lookalikes must pass clean: gmail.co.uk and yahoo.co.id are NOT typos. The
 * edit-distance-1 test naturally clears them (their distance to gmail.com / yahoo.com is
 * > 1), and popular domains are allow-listed so they can never be flagged as suspect.
 */

/** Known-bad domains → the domain they are almost certainly meant to be. HIGH confidence.
 *  gmaol.com is here because 986 rows carry it — a systematic import corruption, not 986
 *  independent typos (see docs/RENCANA-koreksi-kontak.md). */
export const KNOWN_TYPO_DOMAINS: Record<string, string> = {
  "gmaol.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gnail.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com",
};

/** Popular domains used as edit-distance targets AND as an allow-list (never suspect). */
export const POPULAR_DOMAINS: readonly string[] = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.id",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "gmail.co.uk",
  "ymail.com",
  "live.com",
  "proton.me",
];

export type TypoConfidence = "high" | "medium";

export interface EmailTypoResult {
  suspect: boolean;
  /** The suggested corrected domain, when suspect. Never applied automatically. */
  suggestion: string | null;
  confidence: TypoConfidence | null;
  domain: string | null;
}

const NOT_SUSPECT: EmailTypoResult = { suspect: false, suggestion: null, confidence: null, domain: null };

/** Domain part of an email, lowercased/trimmed. Null when it is not an email. */
export function emailDomain(email: string | null | undefined): string | null {
  if (email == null) return null;
  const s = email.trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return null;
  return s.slice(at + 1);
}

/** Levenshtein distance, but short-circuits once it is certain to exceed `max` (we only
 *  care about distance ≤ 1, so this stays cheap). */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  // classic DP; small strings (domains), so full matrix is fine
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // whole row already exceeds the bound
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Detect a likely typo in an email's DOMAIN. Returns a suggestion + confidence, or
 * not-suspect. Never mutates. Order: exact known-typo (high) → edit-distance-1 to a popular
 * domain (medium) → clean. A popular/allow-listed domain is never suspect.
 */
export function detectEmailTypo(email: string | null | undefined): EmailTypoResult {
  const domain = emailDomain(email);
  if (domain == null) return NOT_SUSPECT;

  // A real popular domain is never a typo (guards gmail.co.uk / yahoo.co.id).
  if (POPULAR_DOMAINS.includes(domain)) return { ...NOT_SUSPECT, domain };

  const known = KNOWN_TYPO_DOMAINS[domain];
  if (known) return { suspect: true, suggestion: known, confidence: "high", domain };

  for (const popular of POPULAR_DOMAINS) {
    if (boundedEditDistance(domain, popular, 1) <= 1) {
      return { suspect: true, suggestion: popular, confidence: "medium", domain };
    }
  }
  return { ...NOT_SUSPECT, domain };
}
