import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mailtrap delivery-webhook handling — PURE parts (signature verify + event→column mapping), split
 * out so they can be unit-tested and so the route stays thin. A webhook is UNTRUSTED input from the
 * public internet: the payload is NOT believed until its signature verifies, and even then only the
 * send-cycle timestamp columns of crm_message_log are ever written (never message content).
 *
 * SIGNATURE SCHEME (confirmed 2026-08-24): header `Mailtrap-Signature`, HMAC-SHA256 of the RAW
 * body, hex, constant-time compared. The Symfony bridge + CVE-2026-45755 show the SAME provider also
 * emitting `X-Mt-Signature`, so BOTH names are read (case-insensitive) — if only one were checked and
 * Mailtrap sent the other, every webhook would 401 and the bounce columns would simply never fill,
 * silently. FAILS CLOSED: secret unset or signature absent/mismatched → reject.
 *
 * WHY VERIFICATION IS MANDATORY — DO NOT "SIMPLIFY" THIS AWAY. CVE-2026-45755 is exactly this
 * endpoint's failure mode: the Symfony Mailtrap bridge accepted a webhook secret but never used it,
 * so anyone could POST forged bounces and poison the suppression list. This route DOES verify, which
 * is the only thing separating it from that CVE. A future edit that drops the check, trusts the
 * payload "just to get it working", or downgrades a mismatch from reject to accept re-opens it.
 *
 * REPLAY: an HMAC-valid payload captured off the wire can be re-sent and still verifies. For this
 * system a replayed BOUNCE could inflate the bounce ratio and trip the 5% auto-stop. Two defences,
 * both in the route: (1) events older than MAX_EVENT_AGE_MINUTES are skipped (isEventTooOld);
 * (2) each cycle column is filled only when currently NULL (idempotent — a re-sent event updates 0
 * rows), and a late `delivered` never overwrites a terminal bounced/complained status.
 */

/** Both header names the provider is known to emit. Header lookup is case-insensitive per the
 *  Fetch spec, so lower-case keys match any casing Mailtrap sends. */
export const SIGNATURE_HEADERS = ["mailtrap-signature", "x-mt-signature"] as const;

/** First present signature header value, trying both known names. */
export function readSignatureHeader(getHeader: (name: string) => string | null): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const v = getHeader(name);
    if (v) return v;
  }
  return null;
}

export const MAX_EVENT_AGE_MINUTES = 15;

/** True when an event is older than the allowed window (anti-replay). A missing timestamp is NOT
 *  treated as old — time can't judge it, so idempotency (fill-if-null) is the defence there. */
export function isEventTooOld(
  timestampIso: string | null,
  nowMs: number,
  maxAgeMinutes: number = MAX_EVENT_AGE_MINUTES,
): boolean {
  if (!timestampIso) return false;
  const t = Date.parse(timestampIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t > maxAgeMinutes * 60_000;
}

/** Constant-time verify of an HMAC-SHA256(hex) signature over the raw body. Fail-closed. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type CycleColumn =
  | "delivered_at"
  | "bounced_at"
  | "complained_at"
  | "opened_at"
  | "clicked_at"
  | "unsubscribed_at";

export interface WebhookEffect {
  column: CycleColumn;
  /** New status when the event is terminal for delivery; null = leave status as-is (open/click/etc). */
  status: "delivered" | "bounced" | "complained" | null;
  failureCause: "hard_bounce" | null;
}

/**
 * Map one Mailtrap event NAME to the crm_message_log effect. Pure + total: an unknown/transient
 * event (e.g. soft_bounce) returns null and is IGNORED — never a status change on a guess. Event
 * names are normalized (lower-case, common aliases folded). Confirm the exact set against Mailtrap
 * docs; adding an alias here is the only change needed.
 */
export function mapWebhookEvent(eventName: string): WebhookEffect | null {
  const e = eventName.trim().toLowerCase();
  switch (e) {
    case "delivery":
    case "delivered":
      return { column: "delivered_at", status: "delivered", failureCause: null };
    case "bounce":
    case "hard_bounce":
    case "hardbounce":
      return { column: "bounced_at", status: "bounced", failureCause: "hard_bounce" };
    case "spam":
    case "complaint":
    case "spam_complaint":
      return { column: "complained_at", status: "complained", failureCause: null };
    case "open":
    case "opened":
      return { column: "opened_at", status: null, failureCause: null };
    case "click":
    case "clicked":
      return { column: "clicked_at", status: null, failureCause: null };
    case "unsubscribe":
    case "unsubscribed":
      return { column: "unsubscribed_at", status: null, failureCause: null };
    default:
      return null; // soft_bounce, reject, suspension, and anything unknown → ignored, not guessed
  }
}

export interface WebhookEvent {
  event: string;
  messageId: string | null;
  email: string | null;
  timestampIso: string | null;
}

/** Extract the events array from a Mailtrap payload defensively (shape drift tolerant). Mailtrap
 *  batches events under `events`; each has `event`, `message_id`, `email`, and a unix `timestamp`. */
export function parseWebhookEvents(body: unknown): WebhookEvent[] {
  if (!body || typeof body !== "object") return [];
  const arr = (body as { events?: unknown }).events;
  if (!Array.isArray(arr)) return [];
  const out: WebhookEvent[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { event?: unknown; message_id?: unknown; email?: unknown; timestamp?: unknown };
    if (typeof r.event !== "string") continue;
    out.push({
      event: r.event,
      messageId: typeof r.message_id === "string" ? r.message_id : null,
      email: typeof r.email === "string" ? r.email : null,
      timestampIso:
        typeof r.timestamp === "number" ? new Date(r.timestamp * 1000).toISOString() : null,
    });
  }
  return out;
}
