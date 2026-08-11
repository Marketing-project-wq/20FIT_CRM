/**
 * Suppression write-path INPUT rules — pure, client-safe (imported by the form AND the
 * route handler, so the two never disagree about what is valid). No I/O, no server-only.
 *
 * This is the FIRST runtime consumer of lib/crm/normalize.ts. The Sprint 3B canon fix
 * (`62…` without `+`, lowercase email) finally runs against real input here: an identity
 * is ALWAYS put through normalizePhoneID / normalizeEmail before it can be written, and a
 * null result is a hard rejection — a raw value is never stored (D-2). Getting this wrong
 * is silent: a mis-normalized key simply fails to match at send time, and the only symptom
 * is a suppressed person still being contacted.
 */
import { normalizePhoneID, normalizeEmail } from "./normalize";

export type IdentityKind = "phone" | "email";

export const IDENTITY_KINDS: readonly IdentityKind[] = ["phone", "email"];

export function isIdentityKind(v: unknown): v is IdentityKind {
  return v === "phone" || v === "email";
}

/**
 * reason_code — the DB CHECK locks {user_request, complaint, bounce, legal, legacy_import}.
 * The APP offers only the four that describe a request that ALREADY HAPPENED. `legacy_import`
 * is a valid code but deliberately NOT offered: it exists for a team-decided bulk import,
 * and this sprint bans backfill (a mass INSERT of old data would fabricate stop-requests
 * nobody made). The RPC still accepts the full DB vocab as defense-in-depth; the app's
 * contract simply refuses to be the tool that backfills.
 */
export const RECORD_REASONS = [
  { value: "user_request", label: "Diminta orangnya (WhatsApp / telepon / staf)" },
  { value: "complaint", label: "Komplain atau keberatan" },
  { value: "bounce", label: "Bounce keras / nomor sudah mati" },
  { value: "legal", label: "Permintaan lewat jalur hukum" },
] as const;

export type OfferedReason = (typeof RECORD_REASONS)[number]["value"];

/** Every reason_code the DB accepts (for reference / server defense). */
export const ALL_REASON_CODES = [
  "user_request",
  "complaint",
  "bounce",
  "legal",
  "legacy_import",
] as const;

export function isOfferedReason(v: unknown): v is OfferedReason {
  return typeof v === "string" && RECORD_REASONS.some((r) => r.value === v);
}

/**
 * reason_detail / lifted_reason are FREE TEXT typed by a human. Sprint 3D lesson: cap the
 * length and treat the content as opaque (it can be anything). It is stored on the row but
 * NEVER copied into audit metadata — identity/detail stay off the audit trail.
 */
export const REASON_DETAIL_MAX = 500;
export const LIFTED_REASON_MAX = 500;

export interface PreparedIdentity {
  ok: true;
  identityKind: IdentityKind;
  identityKey: string; // normalized canon (62… / lowercase email)
}
export interface PrepareError {
  ok: false;
  error: string;
}

/**
 * Normalize a raw identity to canon. A null from the normalizer is a CLEAR rejection —
 * never a stored raw value. Callers must surface `error` and refuse the write.
 */
export function prepareIdentity(
  kind: IdentityKind,
  raw: string | null | undefined,
): PreparedIdentity | PrepareError {
  if (kind === "phone") {
    const key = normalizePhoneID(raw);
    if (!key) {
      return {
        ok: false,
        error: "Nomor telepon tidak bisa dinormalkan ke bentuk 62… — tidak disimpan.",
      };
    }
    return { ok: true, identityKind: "phone", identityKey: key };
  }
  const key = normalizeEmail(raw);
  if (!key) {
    return { ok: false, error: "Email tidak valid (harus mengandung @) — tidak disimpan." };
  }
  return { ok: true, identityKind: "email", identityKey: key };
}

/** Trim + cap free text; empty becomes null (so an empty box is not stored as ""). */
export function clampDetail(raw: string | null | undefined, max: number): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === "") return null;
  return s.slice(0, max);
}
