/**
 * Canonical normalization for contact identities — the SINGLE source of truth.
 *
 * D-2 (Sprint 2): ingestion AND suppression-checking MUST call these exact
 * functions. Two implementations that differ in one case (0 vs 62, uppercase email)
 * make suppression fail to match SILENTLY — the only symptom is a suppressed person
 * getting contacted. Never re-implement this in SQL or anywhere else.
 *
 * The canonical phone form here (+62 E.164-style) still must be reconciled with the
 * EXISTING master_customer.phone_normalized / email_normalized values at Sprint 3
 * ingestion (that data cannot be read this sprint). These functions guarantee
 * INTERNAL consistency; matching the legacy values is a Sprint-3 verification.
 */

/**
 * Normalize an Indonesian phone number to `+62`-prefixed E.164-ish form.
 * Handles the trunk `0`, bare `62`, `+62`, an `00` international prefix, and a
 * national number with no prefix, plus spaces / dashes / dots / parentheses.
 * Returns null for anything that is not a usable number.
 */
export function normalizePhoneID(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.replace(/[\s\-().]/g, "");
  if (s === "") return null;

  // A single leading + is allowed; anything else non-digit means "not a phone".
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
  return "+62" + nsn;
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
