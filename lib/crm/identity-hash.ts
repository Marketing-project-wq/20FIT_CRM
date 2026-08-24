import { createHmac } from "node:crypto";
import type { IdentityKind } from "./suppression-input";

/**
 * Keyed hash of a send destination for crm_message_log.identity_hash (send path, correction 1).
 *
 * WHY A HASH, NOT THE RAW ADDRESS. crm_message_log grows one row per send, is read by the Messages
 * screen, and is never pruned. Storing the raw email/phone would turn it into a second, plaintext
 * copy of the contact list — a masking backdoor. So the destination is stored ONLY as this keyed
 * HMAC. It is enough to CORRELATE/MATCH — a bounced address the provider reports can be hashed and
 * matched to its row; "have we ever messaged this identity" is answerable — but not to READ. The
 * question "to whom" is answered by customer_id, which routes through the existing view_contact
 * masking. identity_hash is never exported and never rendered.
 *
 * KEYED (HMAC), not a bare SHA-256. An email/phone has tiny entropy — a bare hash of a phone number
 * is reversible by brute force in seconds. HMAC under a server secret makes the hash unforgeable and
 * un-reversible without the key. Domain-separated (a version-tagged prefix) so this key use can
 * never collide with the unsubscribe-token signature that shares the same secret.
 *
 * The input MUST already be normalized (normalizeEmail / normalizePhoneID) by the caller, so the
 * same person always hashes to the same value regardless of the casing/spacing they were entered
 * with — otherwise a bounced "JOHN@x.com" would not match a stored "john@x.com".
 */

const DOMAIN = "msglog-identity:v1:";

/** Reuse the unsubscribe-link secret (domain-separated). One secret, two clearly-separated HMAC
 *  uses is safe; a dedicated MESSAGE_LOG_HASH_SECRET can be introduced later — the table starts
 *  empty, so a key change is simply a new hashing epoch with nothing to re-derive. Fail-closed. */
export function identityHashSecret(): string {
  const s = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET is not set (or too short) — cannot hash send identities");
  }
  return s;
}

/** Pure given (kind, normalized, secret): HMAC-SHA256 hex of the domain-separated identity. */
export function hashIdentity(kind: IdentityKind, normalized: string, secret: string): string {
  return createHmac("sha256", secret).update(`${DOMAIN}${kind}:${normalized}`).digest("hex");
}
