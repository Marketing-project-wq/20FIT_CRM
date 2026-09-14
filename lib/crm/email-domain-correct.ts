/**
 * Auto-correct known email domain typos BEFORE normalization.
 *
 * Unlike email-typo.ts (detection-only, never corrects), this module applies
 * corrections automatically at ingest entry points — CSV import and single
 * contact add. The mapping covers domains confirmed from the 419-row backfix.
 *
 * Safe to auto-correct: these are unambiguously wrong TLDs or misspellings
 * (gmail.con cannot receive mail). Unknown domains pass through unchanged —
 * they might be valid corporate domains.
 */

export const DOMAIN_CORRECTIONS: Record<string, string> = {
  // gmail typos
  "gmail.col": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cim": "gmail.com",
  "gmail.vom": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaol.com": "gmail.com",
  "gamil.com": "gmail.com",
  // yahoo typos
  "yahoo.con": "yahoo.com",
  "yahoo.col": "yahoo.com",
  "yaboo.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  // hotmail typos
  "hotmail.con": "hotmail.com",
  "hmail.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  // outlook typos
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
};

export interface DomainCorrectionResult {
  email: string;
  corrected: boolean;
  originalDomain: string | null;
  correctedDomain: string | null;
}

export function correctEmailDomain(email: string): string {
  if (!email) return email;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return trimmed;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const fixed = DOMAIN_CORRECTIONS[domain];
  if (!fixed) return trimmed;

  return `${local}@${fixed}`;
}

export function correctEmailDomainWithLog(email: string): DomainCorrectionResult {
  if (!email) return { email, corrected: false, originalDomain: null, correctedDomain: null };
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) {
    return { email: trimmed, corrected: false, originalDomain: null, correctedDomain: null };
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const fixed = DOMAIN_CORRECTIONS[domain];
  if (!fixed) return { email: trimmed, corrected: false, originalDomain: domain, correctedDomain: null };

  return {
    email: `${local}@${fixed}`,
    corrected: true,
    originalDomain: domain,
    correctedDomain: fixed,
  };
}
