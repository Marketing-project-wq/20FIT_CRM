/**
 * Pre-flight check for the environment a real send needs. Pure (env passed in) and testable.
 *
 * WHY (T-30): the first internal-test send died SILENTLY — sendCampaign threw at identityHashSecret()
 * because UNSUBSCRIBE_TOKEN_SECRET was unset, before any row was written, leaving no trace anywhere.
 * The product owner had already lost days to the same shape twice (a missing var found only by a
 * failed attempt). So this reports ALL missing required vars AT ONCE, not just the first — one
 * message the owner can act on in a single pass, instead of one failure per missing var.
 */

/** A required send env var and why it is needed (for a clear, all-at-once report). */
export interface RequiredSendVar {
  name: string;
  reason: string;
}

/**
 * Every env var a real email send requires. NEXT_PUBLIC_APP_URL is intentionally NOT here — it has a
 * safe fallback in send-campaign (defaults to https://crm.20fit.id), so its absence degrades (wrong
 * unsubscribe base) rather than blocks. CAMPAIGN_SEND_ENABLED is NOT here either — its ABSENCE is the
 * safe/correct state (pre-launch), never a blocker.
 */
export const REQUIRED_SEND_VARS: RequiredSendVar[] = [
  { name: "UNSUBSCRIBE_TOKEN_SECRET", reason: "HMAC identity_hash + sign unsubscribe links (fail-closed, ≥16 chars)" },
  { name: "MAILTRAP_API_TOKEN", reason: "authenticate to Mailtrap to send" },
  { name: "MAILTRAP_FROM", reason: "the From address campaigns send as" },
];

/** UNSUBSCRIBE_TOKEN_SECRET must also be long enough (the secret helpers reject < 16). Treat a too-
 *  short value as missing so the pre-check catches it here instead of a throw deep in the send. */
const MIN_SECRET_LEN = 16;

function isPresent(v: RequiredSendVar, env: NodeJS.ProcessEnv): boolean {
  const val = env[v.name];
  if (!val || val.trim().length === 0) return false;
  if (v.name === "UNSUBSCRIBE_TOKEN_SECRET" && val.length < MIN_SECRET_LEN) return false;
  return true;
}

/** Every required send var that is missing (or, for the secret, too short) — reported together. */
export function missingSendEnv(env: NodeJS.ProcessEnv = process.env): RequiredSendVar[] {
  return REQUIRED_SEND_VARS.filter((v) => !isPresent(v, env));
}

/**
 * Classify a thrown send error into a SHORT, PII-FREE cause string for crm_campaign_run.last_error
 * and the on-screen message. Whitelist known messages; for anything else return a generic marker
 * (never the raw message — a provider/DB error could embed an address). The known cases name the
 * exact fix so a stopped run reads as a diagnosis, not a mystery.
 */
export function classifySendThrow(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("UNSUBSCRIBE_TOKEN_SECRET")) return "missing_env:UNSUBSCRIBE_TOKEN_SECRET";
  if (msg.includes("No active email template")) return "no_active_template";
  return "unexpected_error";
}
