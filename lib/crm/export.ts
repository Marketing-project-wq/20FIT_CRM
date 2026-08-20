import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRestrictIds, applyMasterCriteria } from "./segment-read";
import { fetchSuppressedCustomerIds } from "./contactability-read";
import type { SegmentCriteria } from "./segment";
import { EXPORT_COLUMNS, EXPORT_ACTION, csvHeader, csvRow } from "./export-constants";
import { logApiFailure } from "./failure-log";
import type { Dict } from "@/lib/i18n";

/**
 * Segment CSV export — STREAMING row producer (Sprint 4A TUGAS 2). Server-only; the route wires
 * this generator to a streamed Response so bytes flow as pages arrive — the connection stays
 * alive, so an 80k-row export (~80 paged reads ≈ 12s) never hits an idle timeout, WITHOUT a job
 * table (async) or an arbitrary row cap.
 *
 * SAFETY, by construction:
 *   - Reads master_customer ONLY, and only EXPORT_COLUMNS. NIK / DOB / clinical data are not in
 *     that list and are never joined here, so they cannot reach a file (any role, any purpose).
 *   - Suppression is EXCLUDED (marketing purpose): a suppressed profile — the fastest way to
 *     reach someone who asked to stop — is skipped. 0 rows today, but the check ships now.
 *   - The audience is resolved by the SAME resolveRestrictIds + applyMasterCriteria the segment
 *     COUNT used, so the file can't contain a different set of people than the screen showed.
 *
 * ACCOUNTABILITY:
 *   - The `export.performed` audit row is written AFTER the last data row, with the REAL streamed
 *     count — never up front with an estimate. If the client disconnects mid-stream this generator
 *     is abandoned, so no "complete" audit row is written for a partial file (the desired outcome).
 *   - The file ends with an EOF marker line carrying the row count. A file missing that line was
 *     truncated and must not be trusted as complete.
 */

const PAGE = 1000;
const IN_CHUNK = 300; // uuids per .in() batch (bounded URL length)
// Above this many restrict-ids, a full paged scan + in-memory filter (~82 requests for the whole
// pool) beats chunked .in() (size/300 requests). Below it, .in() fetches ONLY the matched rows.
const FULL_SCAN_ABOVE = 20_000;

export interface ExportContext {
  actorId: string;
  actorEmail: string | null;
  /** Human description of the criteria for the file's provenance block + the audit metadata. */
  criteriaSummary: string;
  /** Closed-list criteria snapshot for the audit metadata (NON-PII). */
  criteriaForAudit: Record<string, unknown>;
  /** ISO timestamp stamped into the file + audit (the route supplies it). */
  nowIso: string;
  /** Localised export labels (headers + provenance block) — the file follows the chosen language. */
  labels: Dict["export"];
}

/** Provenance block (CSV comment lines) so a file that leaves the system stays traceable. */
function provenanceLines(ctx: ExportContext): string {
  const L = ctx.labels;
  const lines = [
    `# ${L.provTitle}`,
    `# ${L.provDate}: ${ctx.nowIso}`,
    `# ${L.provBy}: ${ctx.actorEmail ?? ctx.actorId}`,
    `# ${L.provCriteria}: ${ctx.criteriaSummary}`,
    `# ${L.provFooter}`,
  ];
  return lines.map((l) => csvRow([l])).join("");
}

export async function* streamSegmentCsv(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
  masterFilterExpr: string | null,
  ctx: ExportContext,
): AsyncGenerator<string> {
  // Resolve the same audience the count used (fast now — staging via the migration-14 RPC).
  const [suppressed, restrictIds] = await Promise.all([
    fetchSuppressedCustomerIds(admin),
    resolveRestrictIds(admin, criteria),
  ]);

  // UTF-8 BOM (﻿) leads the file so Excel reads it as UTF-8 — without it Excel assumes
  // Windows-1252 and mangles non-ASCII (an em-dash "—" shows as "â€""). The BOM is the first
  // bytes of the whole stream, prepended to the provenance block.
  yield "﻿" + provenanceLines(ctx);
  yield csvHeader((col) => ctx.labels.headers[col as keyof Dict["export"]["headers"]] ?? col);

  const selectCols = ["customer_id", ...EXPORT_COLUMNS.map((c) => c.column).filter((c) => c !== "customer_id")].join(",");
  const emit = (row: Record<string, unknown>): string => csvRow(EXPORT_COLUMNS.map((c) => row[c.column]));

  let count = 0;

  // The row-producing section is wrapped so a mid-stream throw (a bad column, a query error) never
  // ends the file silently after the header — HTTP 200 has already been sent, so the failure cannot
  // surface as a status code. Instead we write a visible failure marker line and stop WITHOUT the
  // success EOF or the audit row, so the file announces itself as truncated and no "complete" audit
  // is recorded for a partial export. The cause is logged (PII-free) via the Sprint 3K failure path.
  try {
    if (restrictIds && restrictIds.size === 0) {
      // Intersected id-set criteria yielded nobody → header + EOF only, no rows.
    } else if (restrictIds && restrictIds.size <= FULL_SCAN_ABOVE) {
      // Small/medium id set: fetch ONLY those rows via chunked .in() (applies master criteria too).
      const ids = Array.from(restrictIds);
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        let q = admin.from("master_customer").select(selectCols).in("customer_id", ids.slice(i, i + IN_CHUNK));
        q = applyMasterCriteria(q, criteria, masterFilterExpr);
        const { data, error } = await q;
        if (error) throw error;
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
          if (suppressed.has(String(row.customer_id))) continue; // suppression wins (K-03/K-26)
          count++;
          yield emit(row);
        }
      }
    } else {
      // No id-set criteria (master-only), or a very large set: page the filtered pool and, when a
      // large id set is present, filter membership in memory. Deterministic order by the PK.
      for (let from = 0; ; from += PAGE) {
        let q = admin
          .from("master_customer")
          .select(selectCols)
          .order("customer_id", { ascending: true })
          .range(from, from + PAGE - 1);
        q = applyMasterCriteria(q, criteria, masterFilterExpr);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        for (const row of rows) {
          const id = String(row.customer_id);
          if (restrictIds && !restrictIds.has(id)) continue; // AND with the id-set criteria
          if (suppressed.has(id)) continue; // suppression wins (K-03/K-26)
          count++;
          yield emit(row);
        }
        if (rows.length < PAGE) break;
      }
    }
  } catch (e) {
    // NON-PII: route + failure type + the DB error code only. Never a row or a criteria value.
    logApiFailure("/exports", "stream_row_fetch_failed", { code: (e as { code?: string })?.code });
    yield csvRow([`# ${ctx.labels.aborted}`]);
    return; // no audit, no success EOF — a truncated file must not look complete
  }

  // Audit AFTER streaming, with the real count. Reached only if all pages streamed (a mid-stream
  // client disconnect abandons the generator, so a partial file leaves no "complete" audit row).
  let auditOk = true;
  try {
    const { error } = await admin.from("crm_audit_log").insert({
      actor_id: ctx.actorId,
      actor_email: ctx.actorEmail,
      action: EXPORT_ACTION,
      target_table: "master_customer",
      summary: `Ekspor segmen CSV (${count} baris).`,
      // NON-PII: closed-list criteria + the columns included + the count. Never the content.
      metadata: {
        row_count: count,
        columns: EXPORT_COLUMNS.map((c) => c.column),
        criteria: ctx.criteriaForAudit,
        suppression_excluded: true,
      },
    });
    if (error) {
      auditOk = false;
      logApiFailure("/exports", "audit_write_failed", { code: error.code });
    }
  } catch (e) {
    auditOk = false;
    logApiFailure("/exports", "audit_write_threw", { code: (e as { code?: string })?.code });
  }

  // EOF marker: a complete file always ends here with the count. Missing = truncated. If the
  // audit write failed the file says so, so a downloaded file never hides a missing audit trail.
  yield csvRow([`# EOF ${ctx.labels.eofTotal}=${count}${auditOk ? "" : ` ${ctx.labels.auditFailed}`}`]);
}
