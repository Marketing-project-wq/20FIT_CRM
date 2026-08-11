/**
 * Consent basis → allowed purpose map — the SINGLE place that answers "does this legal
 * basis permit contacting for this purpose?" (Sprint 3P, TUGAS 1).
 *
 * WHY THIS EXISTS. The product owner has stated verbally that all imported data carries
 * consent and is legal for marketing + customer service. That statement is accepted — but
 * it must be RECORDED, never baked in as silent behaviour (K-03: absence of a row = refusal).
 * The honest way to encode "which basis allows which purpose" is one small, tested table
 * here, so that when legal formally decides, ONE constant changes in ONE file and anyone can
 * read the rule in force without tracing the whole codebase.
 *
 * The vocabulary is fixed by migration 3's CHECK constraints:
 *   basis   ∈ { legacy_import_unverified, explicit_opt_in }
 *   purpose ∈ { marketing, transactional }
 *
 * THE OPEN LEGAL DECISION lives in exactly one flag below
 * (LEGACY_IMPORT_ALLOWS_MARKETING). Flipping it is legal's + the product owner's call, NOT
 * this code's — see docs/SIGNOFF-legal-consent.md. It ships `false` on purpose: the mass
 * 20-April-2026 import has first_seen_at that is entirely a load stamp, so there is no
 * per-person opt-in record to point at, and UU 27/2022 treats "registered for an event" and
 * "agreed to receive promos" as separate permissions. Transactional / service contact under
 * a legacy basis is defensible; marketing under it is the decision that must be made on the
 * record before this returns true.
 */

export type ConsentBasis = "legacy_import_unverified" | "explicit_opt_in";
export type ConsentPurpose = "marketing" | "transactional";

export const CONSENT_BASES: readonly ConsentBasis[] = ["legacy_import_unverified", "explicit_opt_in"];
export const CONSENT_PURPOSES: readonly ConsentPurpose[] = ["marketing", "transactional"];

/**
 * THE legal decision, isolated to one boolean. `false` until legal + product owner record
 * (a) which sources are covered and (b) that a legacy import basis permits marketing.
 * Changing this to `true` is a deliberate, on-the-record act (docs/SIGNOFF-legal-consent.md),
 * not a code cleanup.
 */
export const LEGACY_IMPORT_ALLOWS_MARKETING = false;

/**
 * The map itself. Derived from the flag above so the two can never disagree. explicit_opt_in
 * permits both purposes (a real per-person opt-in is the strongest basis); legacy permits
 * transactional always, and marketing only when the flag is flipped on the record.
 */
export const BASIS_ALLOWED_PURPOSES: Record<ConsentBasis, readonly ConsentPurpose[]> = {
  explicit_opt_in: ["marketing", "transactional"],
  legacy_import_unverified: LEGACY_IMPORT_ALLOWS_MARKETING
    ? ["marketing", "transactional"]
    : ["transactional"],
};

export function isConsentBasis(v: unknown): v is ConsentBasis {
  return typeof v === "string" && (CONSENT_BASES as readonly string[]).includes(v);
}

export function isConsentPurpose(v: unknown): v is ConsentPurpose {
  return typeof v === "string" && (CONSENT_PURPOSES as readonly string[]).includes(v);
}

/**
 * Is `purpose` permitted under `basis`? This is the ONE gate a write path (backfill / opt-in)
 * must call before recording a consent row — so a marketing consent can never be written
 * under a basis that does not permit it. Fail-closed on unknown input.
 */
export function purposePermittedForBasis(basis: unknown, purpose: unknown): boolean {
  if (!isConsentBasis(basis) || !isConsentPurpose(purpose)) return false;
  return BASIS_ALLOWED_PURPOSES[basis].includes(purpose);
}
