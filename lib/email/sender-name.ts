/**
 * The sender display-name rule — client-safe, no I/O — SHARED by the write boundary (POST
 * /api/templates), the send/preview paths, and the Mailtrap client, so none can disagree about what
 * a valid sender name is or how long it may be (the T-74 lesson: one value, one rule, checked where
 * it is written AND where it reaches the wire).
 *
 * WHY a cap. The sender name lands in every recipient's inbox list, where email clients truncate it
 * differently; a 200-character name renders broken. There is no production data to MEASURE (sender_name
 * is a brand-new column, all rows NULL), so the cap is REASONED, not measured: the default is "20FIT"
 * (5), the realistic longest is a brand + location like "20FIT — Studio Jakarta Selatan" (~30), and
 * Gmail's inbox column truncates around 30–40. 64 is generous headroom over the realistic longest and
 * a conventional display-name cap, well under the broken-render range — the same "realistic max +
 * room" discipline as full_name (120, real max 46) and city (80, real 33) in crm_update_master_fields,
 * here with "realistic" standing in for "measured" because no rows exist yet.
 */
export const MAX_SENDER_NAME = 64;

/** Collapse every run of whitespace (newlines, tabs, repeated spaces) to a single space and trim.
 *  A name with a newline renders broken in the inbox; JSON already blocks header injection, so this is
 *  a display rule, not a security one — cleaned at the door rather than carried through. */
export function cleanSenderName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export type SenderNameCheck = { ok: true; value: string | null } | { ok: false; error: "too_long" };

/**
 * Validate a sender name for STORAGE (the route). Cleans first, then measures length in code points
 * (matching Postgres char_length, so an emoji is one). Empty → `null` (store nothing; the send path
 * falls back to the default "20FIT CRM"), never an error. Over the cap → rejected, so a broken name
 * never lands in the table — the reject-at-the-write-path pattern of full_name in the RPC.
 */
export function validateSenderName(raw: string | null | undefined): SenderNameCheck {
  const value = cleanSenderName(raw);
  if (value.length === 0) return { ok: true, value: null };
  if (Array.from(value).length > MAX_SENDER_NAME) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

/** The LAST-resort clamp, applied at the wire (Mailtrap client): clean, then hard-cap in code points,
 *  falling back to "20FIT CRM" when empty. The route already rejects over-length, so this only guards
 *  a legacy/hand-edited row from ever putting a broken or unbounded name into from.name. */
export function senderNameForWire(raw: string | null | undefined): string {
  const cleaned = Array.from(cleanSenderName(raw)).slice(0, MAX_SENDER_NAME).join("");
  return cleaned.length > 0 ? cleaned : "20FIT CRM";
}
