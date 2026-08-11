/**
 * Client-safe UI constants for the audit-log screen. NOT server-only — the client
 * panel imports the labels/tones/artifacts. The retention CATEGORIES themselves are
 * not defined here: they live in the single source lib/crm/retention-policy.ts, and
 * are re-exported below so existing importers keep working.
 */
import { classifyAction, type RetentionClass } from "./retention-policy";

export { classifyAction };
export type { RetentionClass };

export const AUDIT_MAX_PAGE_SIZE = 100;
export const AUDIT_DEFAULT_PAGE_SIZE = 50;

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
