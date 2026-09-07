/**
 * The PII-free error CODE shape — one canon, because this rule is now enforced on two write paths
 * and "a rule written twice will diverge" is a lesson this project has already paid for.
 *
 * WHY A SHAPE GUARD AND NOT A TRIM. Codes get stored (crm_message_log.error_message) and logged
 * (logApiFailure), and both of those are PII-free by design. The text we would be storing comes from
 * a provider or from Postgres — sources we do not control, and some of whose messages quote the
 * offending row ("Key (email_normalized)=(…) already exists"). So a value is taken WHOLE or dropped
 * WHOLE: letters, digits, `_ . -`, at most 40 characters. Truncating free text to fit is exactly the
 * mistake this guards against — a shorter leak is still a leak, and it also destroys the code.
 *
 * Callers: sendFailureCode (lib/crm/send-run.ts, T-41) and the CSV import route (T-49).
 */

export const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * `raw` reduced to a safe code, or null. A finite number is always safe (an HTTP status, a SQLSTATE
 * given as a number); a string must match the shape whole. Anything else — prose, an object, a
 * message that happens to start with a code — is dropped, not salvaged.
 */
export function safeCode(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw !== "string") return null;
  const candidate = raw.trim();
  return SAFE_CODE_PATTERN.test(candidate) ? candidate : null;
}
