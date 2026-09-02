import {
  planImport,
  guessColumnMapping,
  normalizeMappedRow,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportKeys,
  type ImportPlan,
  type NormalizedRow,
} from "./import-audience";

/**
 * Orchestrates one import request. PURE of I/O: every read and write goes through injected `deps`, so
 * a test can prove the central safety property — a `dry_run` NEVER calls a write dep (commit/audit) —
 * without a database. The route provides the real deps (service-role reads + the ingest RPC + audit).
 *
 * Phases:
 *  - "analyze"  → just echo the (guessed or given) mapping + a small preview. No DB, no plan.
 *  - "dry_run"  → load the dedup/suppression keys, plan, return the summary + per-row outcomes. NO write.
 *  - "execute"  → same as dry_run, THEN commit the net-new rows and write the audit record.
 */

export type ImportPhase = "analyze" | "dry_run" | "execute";

export interface ImportInput {
  phase: ImportPhase;
  headers: string[];
  rows: Record<string, string>[];
  mapping?: ColumnMapping;
  /** REQUIRED on execute — the operator's concrete description of where the list came from. Stored as
   *  consent evidence (not a gate). Empty/whitespace is rejected. */
  collectionSource?: string;
  filename?: string;
}

export interface CommitMeta {
  collectionSource: string;
  filename: string | null;
}

export interface ImportDeps {
  /** Read: which of these normalized emails/phones already exist in master, and which are suppressed. */
  loadKeys: (emails: string[], phones: string[]) => Promise<ImportKeys>;
  /** WRITE: insert the net-new people + their consent-evidence rows; returns how many were inserted. */
  commit: (rows: NormalizedRow[], meta: CommitMeta) => Promise<{ inserted: number }>;
  /** WRITE: record the import in the audit log (PII-free counts + provenance). */
  audit: (plan: ImportPlan, meta: CommitMeta & { inserted: number }) => Promise<void>;
}

const PREVIEW_ROWS = 5;

export type ImportResult =
  | { ok: false; error: string }
  | {
      ok: true;
      phase: ImportPhase;
      mapping: ColumnMapping;
      preview: Record<string, string>[];
      plan?: ImportPlan;
      committed?: { inserted: number };
    };

function candidateKeys(rows: Record<string, string>[], mapping: ColumnMapping): { emails: string[]; phones: string[] } {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const r of rows) {
    const n = normalizeMappedRow(r, mapping);
    if (n.emailNormalized) emails.add(n.emailNormalized);
    if (n.phoneNormalized) phones.add(n.phoneNormalized);
  }
  return { emails: Array.from(emails), phones: Array.from(phones) };
}

export async function runImportRequest(input: ImportInput, deps: ImportDeps): Promise<ImportResult> {
  if (input.rows.length === 0) return { ok: false, error: "empty_file" };
  if (input.rows.length > MAX_IMPORT_ROWS) return { ok: false, error: "too_many_rows" };

  const mapping = input.mapping ?? guessColumnMapping(input.headers);
  const preview = input.rows.slice(0, PREVIEW_ROWS);

  // At least one column must be mapped to email — it is the required identity + dedup key.
  const hasEmailColumn = Object.values(mapping).includes("email");
  if (input.phase !== "analyze" && !hasEmailColumn) return { ok: false, error: "no_email_column" };

  if (input.phase === "analyze") {
    return { ok: true, phase: "analyze", mapping, preview };
  }

  const { emails, phones } = candidateKeys(input.rows, mapping);
  const keys = await deps.loadKeys(emails, phones);
  const plan = planImport(input.rows, mapping, keys);

  if (input.phase === "dry_run") {
    // NO write dep is touched here — this is the property import-audience-run.test.ts pins.
    return { ok: true, phase: "dry_run", mapping, preview, plan };
  }

  // execute
  const collectionSource = (input.collectionSource ?? "").trim();
  if (collectionSource === "") return { ok: false, error: "collection_source_required" };
  if (plan.insertRows.length === 0) return { ok: false, error: "nothing_to_import" };

  const meta: CommitMeta = { collectionSource, filename: input.filename?.trim() || null };
  const committed = await deps.commit(plan.insertRows, meta);
  await deps.audit(plan, { ...meta, inserted: committed.inserted });
  return { ok: true, phase: "execute", mapping, preview, plan, committed };
}
