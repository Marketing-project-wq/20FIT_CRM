/**
 * Auto-correct known email domain typos BEFORE normalization.
 *
 * Uses KNOWN_TYPO_DOMAINS from email-typo.ts as the single source of truth for
 * domain corrections. Applied at ingest entry points — CSV import and single
 * contact add. Unknown domains pass through unchanged.
 */

import { KNOWN_TYPO_DOMAINS } from "./email-typo";

export const DOMAIN_CORRECTIONS: Record<string, string> = KNOWN_TYPO_DOMAINS;

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
