import { createHmac, timingSafeEqual } from "node:crypto";
import type { IdentityKind } from "./suppression-input";

/**
 * Signed unsubscribe-link token (contacting-half, TUGAS 3). PURE (node:crypto only) so it is
 * unit-testable with a fixed secret. Server-side only in practice — the public page passes the
 * opaque string through to /api/unsubscribe, which is the only place that verifies it.
 *
 * WHAT IS IN THE TOKEN, AND WHY NOT THE RAW IDENTITY. The payload carries the `customer_id`
 * (a UUID, not PII) and which channel this link is for (`kind`) — NOT the phone/email. The
 * server resolves the actual identity from master_customer at unsubscribe time. That keeps the
 * person's phone/email out of the URL, out of web-server logs, and out of any "forward this
 * email" trail — this project keeps contact PII off surfaces that don't need it (K-02 sibling).
 *
 * WHY UNGUESSABLE MATTERS. The token is customerId + kind + an HMAC over them, keyed by a server
 * secret. Without the secret you cannot forge a valid token for an arbitrary customer, so no one
 * can unsubscribe someone else by editing a UUID in the URL (the LARANGAN requirement). There is
 * deliberately NO expiry: an unsubscribe link inside a months-old email must still work.
 *
 * The secret is `UNSUBSCRIBE_TOKEN_SECRET`. Absent → sign/verify refuse (fail-closed): a missing
 * secret must never silently produce tokens that cannot later be verified, nor verify anything.
 */

export interface UnsubscribePayload {
  customerId: string;
  kind: IdentityKind;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function hmac(payloadB64: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadB64).digest();
}

/** Get the signing secret, or throw a clear error (fail-closed). */
export function unsubscribeSecret(): string {
  const s = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET is not set (or too short) — cannot sign/verify unsubscribe links");
  }
  return s;
}

/** Produce `"<payload>.<sig>"`, both base64url. Pure given (payload, secret). */
export function signUnsubscribeToken(payload: UnsubscribePayload, secret: string): string {
  const json = JSON.stringify({ c: payload.customerId, k: payload.kind });
  const payloadB64 = b64urlEncode(Buffer.from(json, "utf8"));
  const sig = b64urlEncode(hmac(payloadB64, secret));
  return `${payloadB64}.${sig}`;
}

/**
 * Verify + parse. Returns the payload only when the signature matches (constant-time) and the
 * shape is exactly right; otherwise null. Never throws on malformed input — a bad token is a
 * quiet null, not a 500.
 */
export function verifyUnsubscribeToken(token: string, secret: string): UnsubscribePayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let expected: Buffer;
  let given: Buffer;
  try {
    expected = hmac(payloadB64, secret);
    given = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const obj = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const c = (obj as Record<string, unknown>).c;
    const k = (obj as Record<string, unknown>).k;
    if (typeof c !== "string" || c.length === 0) return null;
    if (k !== "phone" && k !== "email") return null;
    return { customerId: c, kind: k };
  } catch {
    return null;
  }
}
