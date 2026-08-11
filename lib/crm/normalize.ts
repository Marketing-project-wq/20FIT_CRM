/**
 * Canonical normalization for contact identities — the SINGLE source of truth.
 *
 * D-2 (Sprint 2): ingestion AND suppression-checking MUST call these exact
 * functions. Two implementations that differ in one case (0 vs 62, uppercase email)
 * make suppression fail to match SILENTLY — the only symptom is a suppressed person
 * getting contacted. Never re-implement this in SQL or anywhere else.
 *
 * RECONCILED 2026-08-11 (Sprint 3B): the canonical phone form is `62…` WITHOUT a
 * leading `+`, to match the EXISTING master_customer.phone_normalized exactly.
 * Verified against the live database that day: of 81.615 filled numbers, 81.584 are
 * stored as `62…` and ZERO begin with `+`. crm_suppression's own comment already
 * ruled that identity_key must be produced by THIS function and match master_customer,
 * and crm_profile_demographic's rule is that master_customer must not be changed —
 * together those leave exactly one option: this function yields, not the data. Getting
 * this wrong is not a loud failure — a `+62…` canon would make suppression matching
 * miss silently, and the only symptom is a suppressed person still being contacted.
 */

/**
 * Normalize an Indonesian phone number to the canonical `62…` form (country code,
 * NO leading `+`), matching master_customer.phone_normalized. Handles the trunk `0`,
 * bare `62`, `+62`, an `00` international prefix, and a national number with no
 * prefix, plus spaces / dashes / dots / parentheses. Returns null for anything that
 * is not a usable number.
 */
export function normalizePhoneID(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.replace(/[\s\-().]/g, "");
  if (s === "") return null;

  // A single leading + is allowed on INPUT; anything else non-digit means "not a
  // phone". It is stripped here and never re-emitted — the canon carries no `+`.
  if (s.startsWith("+")) s = s.slice(1);
  // International 00 prefix -> drop it.
  if (s.startsWith("00")) s = s.slice(2);
  if (!/^\d+$/.test(s)) return null;

  // Reduce to the national significant number: strip a 62 country code or a trunk 0.
  let nsn: string;
  if (s.startsWith("62")) nsn = s.slice(2);
  else if (s.startsWith("0")) nsn = s.slice(1);
  else nsn = s;

  if (nsn === "") return null;
  return "62" + nsn; // canonical: 62… without a plus, to match master_customer
}

/**
 * Normalize an email: trim + lowercase. Intentionally does NOT strip +tags or
 * provider-specific dots — that would wrongly merge distinct addresses at some
 * providers. Returns null if it is not an email.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (s === "" || !s.includes("@")) return null;
  return s;
}
