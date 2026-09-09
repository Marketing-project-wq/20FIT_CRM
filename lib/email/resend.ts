import "server-only";
import type { OutboundEmail, SendReceipt } from "./mailtrap";
import { senderNameForWire } from "./sender-name";

/**
 * Minimal Resend HTTP client — the SAME contract as lib/email/mailtrap.ts (OutboundEmail + category +
 * senderName → SendReceipt), so the two are interchangeable behind lib/email/send.ts. Server-only:
 * RESEND_API_KEY is a Sending credential for the 20fit.id domain and must never reach the client.
 *
 * SHARED ACCOUNT (T-75): the Resend account and its one monthly quota are shared with eight other 20FIT
 * systems (ticketing, POS, password resets, …). A runaway CRM send eats their quota too; the daily
 * ceiling (crm_send_config.daily_limit) is the only brake, since Resend enforces no per-key daily cap.
 *
 * Errors mirror mailtrap.ts EXACTLY (T-41, the foundation of the silent-failure fix): a non-2xx throws
 * an Error whose numeric HTTP status travels as a PROPERTY `err.status` (never in the prose — a number
 * cannot echo an address), and the message carries NO recipient address and NO part of the response
 * body (a provider body can echo the recipient). Without err.status every failure reached the send log
 * as `unknown` + NULL; the classifier reads status, not words.
 *
 * VERIFIED against Resend's own reference (github.com/resend/resend-skills), Sep 2026 — resend.com is
 * egress-blocked from this environment, so the shapes below are cross-checked from that repo + search,
 * not the live docs page:
 *   - POST https://api.resend.com/emails, Bearer <RESEND_API_KEY> (keys prefixed `re_`).
 *   - `from` is a SINGLE string "Name <email>" (NOT Mailtrap's {email,name} object); `to` is an array.
 *   - Success body is top-level `{ "id": "<uuid>" }` (the raw HTTP API; the SDK wraps it as {data:{id}}).
 *   - Rate limit → HTTP 429 (confirmed). 429 is already in THROTTLE_STATUSES, so backoff treats it as
 *     provider_throttled with no code change. Monthly-quota-exhaustion status is NOT documented in what
 *     was reachable — see TEMUAN T-75 / TUGAS 6 (hypothesis, not asserted).
 */

const SEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend's tag values must match /^[A-Za-z0-9_-]+$/ (ASCII letters/digits/_/-). Our categories
 *  ("password-reset", "crm-campaign", "campaign-preview") already fit; anything odd is dropped rather
 *  than rejected by the API, so a stray category never fails a send. */
function safeCategory(category: string): string | null {
  return /^[A-Za-z0-9_-]+$/.test(category) ? category : null;
}

export async function sendTransactionalEmail(
  mail: OutboundEmail,
  category = "password-reset",
  senderName = "20FIT CRM",
): Promise<SendReceipt> {
  const token = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!token || !from) {
    throw new Error("Resend is not configured (RESEND_API_KEY / RESEND_FROM missing).");
  }

  const tag = safeCategory(category);
  const res = await fetch(SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Resend takes the from-identity as one "Name <email>" string. senderNameForWire cleans + clamps
      // the name (same last-resort guard as the Mailtrap path); RESEND_FROM is the verified address.
      from: `${senderNameForWire(senderName)} <${from}>`,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(tag ? { tags: [{ name: "category", value: tag }] } : {}),
    }),
    cache: "no-store", // never cache an email send
  });

  if (!res.ok) {
    // Do NOT include the recipient or the response body verbatim (either could echo the address). The
    // numeric status travels as a PROPERTY only — the one piece of provider feedback that is PII-free
    // by construction, and what the send log records as the failure code (T-41).
    throw resendHttpError(res.status);
  }

  return { providerMessageId: extractResendId(await safeJson(res)) };
}

/** A non-2xx from the Resend API, carrying the HTTP status as a readable property — identical shape to
 *  MailtrapSendError so the classifier (send-run.ts) reads both the same way. */
export interface ResendSendError extends Error {
  status: number;
}

function resendHttpError(status: number): ResendSendError {
  const err = new Error(`Resend send failed with HTTP ${status}.`) as ResendSendError;
  err.status = status;
  return err;
}

/** Resend's raw send response is top-level `{ "id": "<uuid>" }`. Return it as provider_message_id for
 *  webhook correlation; null on an unexpected body (recorded honestly, never invented). */
export function extractResendId(body: unknown): string | null {
  if (body && typeof body === "object" && "id" in body) {
    const id = (body as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }
  return null;
}

/** Parse the response JSON without throwing (a 2xx with an unexpected body must not fail a send that
 *  already went out). Returns null on any parse issue. */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
