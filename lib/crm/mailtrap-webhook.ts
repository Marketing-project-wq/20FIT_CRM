import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mailtrap delivery-webhook handling — PURE parts (signature verify + event→column mapping), split
 * out so they can be unit-tested and so the route stays thin. A webhook is UNTRUSTED input from the
 * public internet: the payload is NOT believed until its signature verifies, and even then only the
 * send-cycle timestamp columns of crm_message_log are ever written (never message content).
 *
 * NOTE ON THE SIGNATURE SCHEME: Mailtrap's exact header name + signing algorithm must be confirmed
 * against the current Mailtrap webhook docs before this is enabled in production (the doc host is
 * egress-blocked from the build environment). This implements the safe, common shape — HMAC-SHA256
 * of the RAW request body, hex, constant-time compared to a signature header — and FAILS CLOSED
 * (rejects) when the secret is unset or the signature is absent/mismatched. If Mailtrap's scheme
 * differs, only verifyWebhookSignature changes; the mapping + route stay the same.
 */

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
