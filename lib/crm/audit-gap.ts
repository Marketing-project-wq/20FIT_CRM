/**
 * Audit-log id GAP as a signal — pure, client-safe (the /settings panel imports it).
 *
 * crm_audit_log.id is a sequence. An INSERT that is reached but not committed (rolled
 * back, connection dropped, request cancelled) STILL consumes its number, then leaves no
 * row. So a hole in the id sequence is the ONLY trace of a failed audited operation —
 * the row that would have recorded it is exactly the row that never landed. A reader of
 * the audit screen must know the list they see is INCOMPLETE, and by how much.
 *
 * NEVER refill or reset crm_audit_log_id_seq (see docs/riwayat/KEPUTUSAN.md K-21): that
 * erases the only evidence left.
 */

/**
 * Known-legitimate gaps — holes with a documented, benign cause, excluded so they don't
 * raise a false alarm forever. Keep this list tiny and sourced.
 *   id=4 — a synthetic audit row deleted by the Sprint 3A purge-function verification
 *          (docs/riwayat/FAKTA-DATA.md). Not a failed operation.
 */
export const KNOWN_LEGIT_GAPS: readonly number[] = [4];

export interface AuditGapSummary {
  minId: number | null;
  maxId: number | null;
  count: number;
  /** maxId - minId + 1 (the id range), or 0 when the log is empty. */
  span: number;
  /** span - count: total id numbers with no row. */
  missing: number;
  /** How many KNOWN_LEGIT_GAPS fall within [minId, maxId]. */
  knownLegit: number;
  /** missing - knownLegit: holes with no documented cause = failed audited operations. */
  unexplained: number;
}

/**
 * Summarize the id gap over a set of audit rows described by its min id, max id and row
 * count. Pure: the caller runs the three cheap aggregates; this does the arithmetic so it
 * can be unit-tested. Computed over the WHOLE log (not a filtered page) — a filtered
 * view's "gaps" are mostly rows excluded by the filter, not failures, so filtering the id
 * range would turn a real signal into noise.
 */
export function summarizeAuditGap(
  minId: number | null,
  maxId: number | null,
  count: number,
  knownLegit: readonly number[] = KNOWN_LEGIT_GAPS,
): AuditGapSummary {
  if (minId == null || maxId == null || count <= 0 || maxId < minId) {
    return { minId, maxId, count: Math.max(0, count), span: 0, missing: 0, knownLegit: 0, unexplained: 0 };
  }
  const span = maxId - minId + 1;
  const missing = Math.max(0, span - count);
  const knownInRange = knownLegit.filter((id) => id >= minId && id <= maxId).length;
  // Cap knownLegit at `missing` so a mislisted known-gap can't drive unexplained negative.
  const knownCapped = Math.min(knownInRange, missing);
  const unexplained = missing - knownCapped;
  return { minId, maxId, count, span, missing, knownLegit: knownCapped, unexplained };
}
