/**
 * Pure Mailtrap response parsing — split out of mailtrap.ts (which is `server-only`) so the parser
 * can be unit-tested. No I/O, no secrets.
 */

/** Pull the first message id out of Mailtrap's `{ message_ids: [...] }`. Tolerant of shape drift:
 *  a body without a string id yields null (recorded honestly), never a throw. */
export function extractMessageId(body: unknown): string | null {
  if (body && typeof body === "object" && "message_ids" in body) {
    const ids = (body as { message_ids?: unknown }).message_ids;
    if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === "string") return ids[0];
  }
  return null;
}
