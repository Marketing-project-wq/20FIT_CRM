/**
 * Server-side contact masking (PRD 17.1). These run on the server BEFORE any row
 * leaves for the browser — the real phone/email must never reach the client for a
 * masked role. Never call these to "un-mask": there is no inverse here by design.
 *
 * Target shapes from PRD 17.1:
 *   phone  `+6281234568953` -> `62812****8953`   (first 5 digits, ****, last 4)
 *   email  `john@domain.com` -> `j***@domain.com` (first char of local, ***, @domain)
 */

/** Mask an already-normalized phone. Returns null for empty; a conservative `****`
 *  for anything too short to reveal a head+tail without overlap. */
export function maskPhone(normalized: string | null | undefined): string | null {
  if (normalized == null) return null;
  const s = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (s === "") return null;
  // Need at least 5 leading + 4 trailing with no overlap.
  if (s.length < 9) return "****";
  return s.slice(0, 5) + "****" + s.slice(-4);
}

/** Mask an email: keep the first local char, then `***`, then the full `@domain`.
 *  Anything without a usable local part collapses to `***`. */
export function maskEmail(normalized: string | null | undefined): string | null {
  if (normalized == null) return null;
  const s = normalized;
  if (s === "") return null;
  const at = s.indexOf("@");
  if (at <= 0) return "***"; // no local part or not an address -> reveal nothing
  return s[0] + "***" + s.slice(at);
}
