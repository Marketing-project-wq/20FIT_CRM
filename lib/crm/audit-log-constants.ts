/**
 * Client-safe constants + pure helpers for the audit-log screen. NOT server-only —
 * the client panel imports the classifier and labels. The service-role query lives in
 * lib/crm/audit-log.ts (server-only). Same split as audience-constants.ts.
 */

export const AUDIT_MAX_PAGE_SIZE = 100;
export const AUDIT_DEFAULT_PAGE_SIZE = 50;

/**
 * Retention classification — MIRRORS migration 8 (crm_purge_audit_log) EXACTLY. If
 * migration 8's allowlist changes, change this too; they must never drift, because
 * this is what the screen tells readers about which rows can disappear.
 *
 *   operational -> purged after 90 days (allowlist: profile.viewed, list.viewed,
 *                  search.*, login.*)
 *   compliance  -> excluded from purge PERMANENTLY (consent.*, suppression.*, role.*,
 *                  profile.deleted, export.*, retention.*)
 *   other       -> not in the purge allowlist, so retained by default (e.g. the
 *                  Sprint 2B trigger-check artifact). Retained, but NOT a deliberate
 *                  compliance guarantee — just never matched by the purge.
 */
export type RetentionClass = "operational" | "compliance" | "other";

export function classifyAction(action: string): RetentionClass {
  if (
    action === "profile.viewed" ||
    action === "list.viewed" ||
    action.startsWith("search.") ||
    action.startsWith("login.")
  ) {
    return "operational";
  }
  if (
    action.startsWith("consent.") ||
    action.startsWith("suppression.") ||
    action.startsWith("role.") ||
    action === "profile.deleted" ||
    action.startsWith("export.") ||
    action.startsWith("retention.")
  ) {
    return "compliance";
  }
  return "other";
}

export const RETENTION_LABEL: Record<RetentionClass, string> = {
  operational: "Operasional · dipangkas > 90 hari",
  compliance: "Kepatuhan · disimpan permanen",
  other: "Lain · tak masuk allowlist purge",
};

/** Tone per retention class (design-system tones only). */
export const RETENTION_TONE: Record<RetentionClass, "blue" | "green" | "neutral"> = {
  operational: "blue",
  compliance: "green",
  other: "neutral",
};

/**
 * Verification artifacts — real rows that are NOT real activity. Marked on screen so a
 * reader never mistakes them for events. Kept append-only by design (do not delete).
 */
export const ARTIFACT_ROWS: Record<number, string> = {
  1: "Artefak uji trigger append-only (Sprint 2B) — bukan aktivitas.",
  5: "Artefak verifikasi retensi (Sprint 3A) — pemangkasan uji, bukan aktivitas.",
};

export function isArtifact(id: number): boolean {
  return id in ARTIFACT_ROWS;
}
