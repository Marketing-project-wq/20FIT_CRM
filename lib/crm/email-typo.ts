/**
 * Email typo DETECTION + CORRECTION — pure, client-safe.
 *
 * Detection: `detectEmailTypo()` returns a flag + suggestion + confidence.
 * Correction: `correctEmailTypo()` applies the fix (domain swap + structural cleanup).
 *
 * The auto-fix path (lib/crm/email-typo-fix.ts) corrects ONLY high-confidence domain
 * typos from KNOWN_TYPO_DOMAINS. Medium-confidence (edit-distance-1) matches are shown
 * for review but not auto-applied — one wrong guess sends data to someone else.
 *
 * Legit lookalikes must pass clean: gmail.co.uk and yahoo.co.id are NOT typos. The
 * edit-distance-1 test naturally clears them (their distance to gmail.com / yahoo.com is
 * > 1), and popular domains are allow-listed so they can never be flagged as suspect.
 */

/** Known-bad domains → the domain they are almost certainly meant to be. HIGH confidence.
 *  Merged from email-domain-correct.ts (ingest-time) + original detection list. */
export const KNOWN_TYPO_DOMAINS: Record<string, string> = {
  // gmail
  "gmaol.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.col": "gmail.com",
  "gmail.cim": "gmail.com",
  "gmail.vom": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmail.coom": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmali.com": "gmail.com",
  "gmaik.com": "gmail.com",
  "gmsil.com": "gmail.com",
  "gmeil.com": "gmail.com",
  "g.mail.com": "gmail.com",
  // yahoo
  "yahoo.con": "yahoo.com",
  "yahoo.col": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yahoo.comm": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yaboo.com": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "yahooo.co.id": "yahoo.co.id",
  "yaho.co.id": "yahoo.co.id",
  // hotmail
  "hotmail.con": "hotmail.com",
  "hotmail.col": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hmail.com": "hotmail.com",
  "hotamil.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  // outlook
  "outlook.con": "outlook.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlool.com": "outlook.com",
  "outllok.com": "outlook.com",
  // icloud
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  // ymail
  "ymail.con": "ymail.com",
  "ymal.com": "ymail.com",
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
 * not-suspect. Never mutates. Order: structural fix (high) → exact known-typo (high) →
 * edit-distance-1 to a popular domain (medium) → clean. A popular/allow-listed domain
 * is never suspect.
 */
export function detectEmailTypo(email: string | null | undefined): EmailTypoResult {
  const structural = fixStructuralIssues(email);
  if (structural) return structural;

  const domain = emailDomain(email);
  if (domain == null) return NOT_SUSPECT;

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

/**
 * Detect structural email issues: trailing dots, double dots in domain, missing TLD,
 * spaces. Returns an EmailTypoResult if fixable, null if no structural issue.
 */
function fixStructuralIssues(email: string | null | undefined): EmailTypoResult | null {
  if (email == null) return null;
  const s = email.trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return null;

  const domain = s.slice(at + 1);

  // Trailing dot: user@gmail.com.
  if (domain.endsWith(".")) {
    const cleaned = domain.slice(0, -1);
    if (POPULAR_DOMAINS.includes(cleaned) || KNOWN_TYPO_DOMAINS[cleaned]) {
      const suggestion = KNOWN_TYPO_DOMAINS[cleaned] ?? cleaned;
      return { suspect: true, suggestion, confidence: "high", domain };
    }
  }

  // Double dot: user@gmail..com
  if (domain.includes("..")) {
    const cleaned = domain.replace(/\.{2,}/g, ".");
    if (POPULAR_DOMAINS.includes(cleaned)) {
      return { suspect: true, suggestion: cleaned, confidence: "high", domain };
    }
  }

  // Missing TLD: user@gmail (no dot at all)
  if (!domain.includes(".")) {
    const withCom = domain + ".com";
    if (POPULAR_DOMAINS.includes(withCom)) {
      return { suspect: true, suggestion: withCom, confidence: "high", domain };
    }
    const withCoId = domain + ".co.id";
    if (POPULAR_DOMAINS.includes(withCoId)) {
      return { suspect: true, suggestion: withCoId, confidence: "high", domain };
    }
  }

  // Space in domain: user@gm ail.com
  if (/\s/.test(domain)) {
    const cleaned = domain.replace(/\s+/g, "");
    if (POPULAR_DOMAINS.includes(cleaned)) {
      return { suspect: true, suggestion: cleaned, confidence: "high", domain };
    }
  }

  return null;
}

/**
 * Apply a detected typo fix to an email address. Given the original email and the
 * corrected domain from detectEmailTypo().suggestion, returns the full corrected email.
 * Also handles structural fixes (trailing dots, double dots, spaces).
 */
export function correctEmail(email: string, correctedDomain: string): string {
  const s = email.trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1) return s;
  const local = s.slice(0, at).replace(/\s+/g, "");
  return `${local}@${correctedDomain}`;
}
