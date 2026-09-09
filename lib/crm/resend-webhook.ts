import { createHmac, timingSafeEqual } from "node:crypto";
import { type WebhookEffect } from "./mailtrap-webhook";

/**
 * Resend delivery-webhook handling — PURE parts (Svix signature verify + event→column mapping), the
 * Resend twin of lib/crm/mailtrap-webhook.ts. A webhook is UNTRUSTED public input: the payload is NOT
 * believed until its signature verifies, and even then only the send-cycle timestamp columns of
 * crm_message_log are written (never message content). The EFFECT shape (WebhookEffect / CycleColumn)
 * is shared with the Mailtrap module — one status-transition vocabulary, two providers.
 *
 * SIGNATURE SCHEME (Resend signs via Svix; verified Sep 2026 against github.com/resend/resend-skills —
 * resend.com is egress-blocked here, so this is cross-checked from that repo + search, not the live
 * docs page): three headers travel with each request — `svix-id`, `svix-timestamp`, `svix-signature`.
 * The signed content is `${svix-id}.${svix-timestamp}.${rawBody}`; the signature is
 * base64(HMAC-SHA256(signedContent, key)), where `key` is the base64-decoded material after the
 * `whsec_` prefix of RESEND_WEBHOOK_SECRET. The `svix-signature` header carries one or more
 * space-separated `v1,<sig>` tokens; ANY matching token is valid. FAILS CLOSED: secret unset or any
 * header absent/mismatched → reject.
 *
 * WHY VERIFICATION IS MANDATORY — DO NOT "SIMPLIFY" IT AWAY. A webhook route that skips the signature
 * is an open door for anyone to POST forged bounces and poison the suppression list (this is exactly
 * CVE-2026-45755, cited in mailtrap-webhook.ts). Verification is the only thing preventing that.
 *
 * REPLAY: an HMAC-valid payload can be re-sent. `svix-timestamp` is part of the signed content, so a
 * replayer cannot alter it without breaking the signature; the route rejects a too-old timestamp AND
 * fills each cycle column only when NULL (a re-sent event updates 0 rows), so a replayed bounce can
 * never inflate the auto-stop ratio and a late `delivered` can never overwrite a terminal bad status.
 */

export const SVIX_ID_HEADER = "svix-id";
export const SVIX_TIMESTAMP_HEADER = "svix-timestamp";
export const SVIX_SIGNATURE_HEADER = "svix-signature";

/** Standard Svix tolerance: reject a signed timestamp more than this many minutes from now (replay). */
export const MAX_SVIX_TIMESTAMP_AGE_MINUTES = 5;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Constant-time verify of a Svix-signed Resend webhook. Fail-closed on any missing input. */
export function verifyResendSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string | null | undefined,
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const secretBytes = Buffer.from(keyMaterial, "base64");
  if (secretBytes.length === 0) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");

  // Header is space-separated "v1,<base64sig>" tokens; ANY match is valid.
  for (const token of headers.signature.split(" ")) {
    const comma = token.indexOf(",");
    const sig = comma >= 0 ? token.slice(comma + 1) : token;
    const sigBuf = Buffer.from(sig, "utf8");
    if (sigBuf.length !== expectedBuf.length) continue; // timingSafeEqual throws on length mismatch
    try {
      if (timingSafeEqual(sigBuf, expectedBuf)) return true;
    } catch {
      // length race — treat as no match
    }
  }
  return false;
}

/** True when the Svix-signed unix-seconds timestamp is further than the tolerance from `nowMs`
 *  (either direction). A missing/unparseable timestamp is treated as too old (fail-closed) — the
 *  signature already required it to be present, so this only bites a malformed value. */
export function isSvixTimestampTooOld(
  svixTimestamp: string | null,
  nowMs: number,
  maxAgeMinutes: number = MAX_SVIX_TIMESTAMP_AGE_MINUTES,
): boolean {
  if (!svixTimestamp) return true;
  const secs = Number(svixTimestamp);
  if (!Number.isFinite(secs)) return true;
  return Math.abs(nowMs - secs * 1000) > maxAgeMinutes * 60_000;
}

/**
 * Map one Resend event `type` to the crm_message_log effect — the SAME WebhookEffect vocabulary the
 * Mailtrap mapper uses (delivered/bounced/complained/opened/clicked). Pure + total: an unknown or
 * transient event returns null and is IGNORED, never a status change on a guess. `email.sent` is a
 * no-op here — status='sent'/sent_at are stamped at SEND time, not from a webhook. A SOFT bounce
 * (`bounceType === "soft"`) is transient and must NEVER auto-suppress, so it is ignored; only a hard
 * bounce sets bounced + hard_bounce.
 */
export function mapResendEvent(type: string, bounceType?: string | null): WebhookEffect | null {
  switch (type.trim().toLowerCase()) {
    case "email.delivered":
      return { column: "delivered_at", status: "delivered", failureCause: null };
    case "email.bounced":
      if ((bounceType ?? "").toLowerCase() === "soft") return null; // transient → never suppress
      return { column: "bounced_at", status: "bounced", failureCause: "hard_bounce" };
    case "email.complained":
      return { column: "complained_at", status: "complained", failureCause: null };
    case "email.opened":
      return { column: "opened_at", status: null, failureCause: null };
    case "email.clicked":
      return { column: "clicked_at", status: null, failureCause: null };
    default:
      return null; // email.sent, email.delivery_delayed, email.failed, domain.*, contact.* → ignored
  }
}

export interface ResendEvent {
  type: string;
  messageId: string | null; // data.email_id → correlates to crm_message_log.provider_message_id
  email: string | null; // first recipient, for identity_hash fallback correlation
  timestampIso: string | null; // created_at
  bounceType: string | null; // hard | soft (bounce events)
}

/** Extract one Resend event defensively (shape-drift tolerant). Resend delivers ONE event per POST
 *  as `{ type, created_at, data: { email_id, to, ... } }` — not a batched array like Mailtrap. */
export function parseResendEvent(body: unknown): ResendEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { type?: unknown; created_at?: unknown; data?: unknown };
  if (typeof b.type !== "string") return null;
  const data = (b.data && typeof b.data === "object" ? b.data : {}) as Record<string, unknown>;

  let email: string | null = null;
  if (Array.isArray(data.to) && typeof data.to[0] === "string") email = data.to[0];
  else if (typeof data.to === "string") email = data.to;
  else if (typeof data.email === "string") email = data.email as string;

  // bounce_type may appear flat (data.bounce_type) or nested (data.bounce.type) across payload versions.
  let bounceType: string | null = null;
  if (typeof data.bounce_type === "string") bounceType = data.bounce_type;
  else if (data.bounce && typeof data.bounce === "object") {
    const t = (data.bounce as { type?: unknown }).type;
    if (typeof t === "string") bounceType = t;
  }

  return {
    type: b.type,
    messageId: typeof data.email_id === "string" ? data.email_id : null,
    email,
    timestampIso: typeof b.created_at === "string" ? b.created_at : null,
    bounceType,
  };
}
