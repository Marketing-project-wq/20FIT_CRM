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
 *
 * PROVIDER-AWARE (TAMBAHAN B): the send credentials required depend on EMAIL_PROVIDER. A blind list
 * that always demanded the Mailtrap vars would, after the switch to Resend, check vars the send no
 * longer uses and MISS the ones it does — and the failure would surface at send time, not at the
 * pre-check. So the provider-specific vars are chosen from the ACTIVE provider (default mailtrap).
 */
const COMMON_SEND_VARS: RequiredSendVar[] = [
  { name: "UNSUBSCRIBE_TOKEN_SECRET", reason: "HMAC identity_hash + sign unsubscribe links (fail-closed, ≥16 chars)" },
];
const MAILTRAP_SEND_VARS: RequiredSendVar[] = [
  { name: "MAILTRAP_API_TOKEN", reason: "authenticate to Mailtrap to send" },
  { name: "MAILTRAP_FROM", reason: "the From address campaigns send as" },
];
const RESEND_SEND_VARS: RequiredSendVar[] = [
  { name: "RESEND_API_KEY", reason: "authenticate to Resend to send" },
  { name: "RESEND_FROM", reason: "the From address campaigns send as" },
];

/** The vars a real send requires under the ACTIVE provider (EMAIL_PROVIDER, default mailtrap). */
export function requiredSendVars(env: NodeJS.ProcessEnv = process.env): RequiredSendVar[] {
  const providerVars = env.EMAIL_PROVIDER === "resend" ? RESEND_SEND_VARS : MAILTRAP_SEND_VARS;
  return [...COMMON_SEND_VARS, ...providerVars];
}

/** The DEFAULT (Mailtrap) required set — kept for the default-provider path and existing callers.
 *  Prefer requiredSendVars(env) where the active provider matters. */
export const REQUIRED_SEND_VARS: RequiredSendVar[] = [...COMMON_SEND_VARS, ...MAILTRAP_SEND_VARS];

/** UNSUBSCRIBE_TOKEN_SECRET must also be long enough (the secret helpers reject < 16). Treat a too-
 *  short value as missing so the pre-check catches it here instead of a throw deep in the send. */
const MIN_SECRET_LEN = 16;

function isPresent(v: RequiredSendVar, env: NodeJS.ProcessEnv): boolean {
  const val = env[v.name];
  if (!val || val.trim().length === 0) return false;
  if (v.name === "UNSUBSCRIBE_TOKEN_SECRET" && val.length < MIN_SECRET_LEN) return false;
  return true;
}

/** Every required send var (for the ACTIVE provider) that is missing (or, for the secret, too short) —
 *  reported together. */
export function missingSendEnv(env: NodeJS.ProcessEnv = process.env): RequiredSendVar[] {
  return requiredSendVars(env).filter((v) => !isPresent(v, env));
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
  if (msg.includes("MAILTRAP_API_TOKEN") || msg.includes("Mailtrap is not configured")) return "missing_env:MAILTRAP";
  if (msg.includes("RESEND_API_KEY") || msg.includes("Resend is not configured")) return "missing_env:RESEND";
  if (msg.includes("No active email template")) return "no_active_template";
  if (msg.includes("Mailtrap send failed")) return "mailtrap_send_failed";
  if (msg.includes("Resend send failed")) return "resend_send_failed";
  if (msg.includes("unsubscribe URL")) return "missing_unsubscribe_url";
  // A recipient id that is not a valid uuid (crm_message_log.customer_id / crm_suppression.customer_id
  // are `uuid`). This is what a raw/synthetic id — an address not resolved to a real master_customer —
  // throws at insert. Named on its own so identity-resolution failures are never "unexpected" again
  // (the 28 Aug email-list runs — resolution now happens BEFORE the run, see resolveEmailListRecipients).
  if (msg.includes("invalid input syntax for type uuid")) return "invalid_recipient_id";
  return "unexpected_error";
}

/** The base URL a send falls back to when NEXT_PUBLIC_APP_URL is unset. MUST match send-campaign's
 *  fallback — the unsubscribe link is built from it, so the host check must judge the same value. */
export const DEFAULT_APP_URL = "https://crm.20fit.id";

/** Hostname (lowercased, no scheme/port/path) of a URL or bare host string. Null if unparseable. */
export function hostOf(url: string | undefined | null): string | null {
  if (!url || !url.trim()) return null;
  const raw = url.trim();
  try {
    const h = new URL(raw).hostname.toLowerCase();
    if (h) return h; // a bare "host:port" parses with an empty hostname → fall through to manual
  } catch {
    // not a full URL → manual parse below
  }
  return raw.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].trim().toLowerCase() || null;
}

/**
 * The unsubscribe link a campaign sends is built from NEXT_PUBLIC_APP_URL (or the crm.20fit.id
 * fallback). If that host is NOT the host actually serving the app, the link is DEAD — a recipient
 * who wants to unsubscribe can't, and marks the mail spam instead. That is the most damaging failure
 * in a campaign email, so a send whose unsubscribe host ≠ the serving host must be REFUSED (an email
 * with a dead unsubscribe link is worse than not sending). Reuse: set NEXT_PUBLIC_APP_URL to the host
 * you actually serve from (the Railway host until DNS for crm.20fit.id resolves), then it matches.
 *
 * Best-effort on the serving host: if it can't be determined (no Host header), we do NOT block —
 * the check needs a real host to compare against, and refusing on "unknown" would be its own footgun.
 */
export function unsubscribeHostServable(
  appUrl: string | undefined,
  servingHost: string | undefined | null,
): { ok: boolean; linkHost: string | null; servingHost: string | null } {
  const linkHost = hostOf(appUrl && appUrl.trim() ? appUrl : DEFAULT_APP_URL);
  const serving = servingHost ? servingHost.split(",")[0].split(":")[0].trim().toLowerCase() || null : null;
  if (!serving) return { ok: true, linkHost, servingHost: null }; // can't compare → don't block
  return { ok: linkHost === serving, linkHost, servingHost: serving };
}
