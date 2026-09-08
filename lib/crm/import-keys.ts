import type { ImportKeys } from "./import-audience";
import { safeCode } from "./safe-code";

/**
 * The dedup/suppression key reader for CSV import — EXTRACTED from the route so it can be unit-tested
 * with a fake client (the route's inline version could not be, and that is how the T-69 swallow hid).
 *
 * TWO invariants, both learned the hard way (T-69, 8 Sep 2026):
 *
 *  1. FAIL LOUD. Every read captures `error` and THROWS on it (readFailure). The route wraps the whole
 *     import in try/catch and this is the FIRST dep call, so a throw aborts before any write — zero
 *     partial writes. Swallowing the error (the old `const { data } =`) let a failed read look like an
 *     empty table: planImport then treated every row as net-new and the ingest anti-join silently
 *     skipped everyone already in the pool — a half import under a green check.
 *
 *  2. CHUNK the `.in()` lists. supabase-js puts every value in the request URL; past the gateway's
 *     ~24-25 KB URL limit the request is rejected with HTTP 400 (measured 8 Sep: 450 max-length emails
 *     = 23.4 KB → 200; 500 = 26 KB → 400). A single 1.432-email `.in()` was ~58 KB and always failed.
 *     IMPORT_LOOKUP_CHUNK = 300 matches the repo's other email-`.in()` readers (enrichment, multisource,
 *     clinic-source) and is measured-safe: 300 max-length (54-char) emails ≈ 15.6 KB, well under the
 *     break; at the p99 length (32) ≈ 9.6 KB. One convention, not a sixth divergent constant.
 *
 * The RIGHT long-term fix is to pass the email list to a SQL function and let the anti-join and the
 * key lookup share ONE decision (today the TS planner and the SQL anti-join each decide "who is new"
 * — two sources of truth over one question, the class that has bitten this project repeatedly). That
 * needs a gated migration, so it is a separate round; recorded in TEMUAN T-69.
 */

export const IMPORT_LOOKUP_CHUNK = 300;

type Row = Record<string, unknown>;
type PgResult = { data: Row[] | null; error: { code?: string | null } | null };

/** The minimal slice of the service-role client this reader needs — narrow on purpose so a test can
 *  supply a fake without reconstructing the whole SupabaseClient type. The route passes the real
 *  admin client (cast), which satisfies this structurally. */
export interface ImportReadClient {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: readonly string[]): PromiseLike<PgResult>;
      eq(column: string, value: string): PromiseLike<PgResult>;
    };
  };
}

export type ReadStage = "email" | "phone" | "suppression";

/** A failed read as a PII-free Error carrying the DB code — import must fail loud, never proceed with
 *  empty keys (see the module header). */
export function readFailure(stage: ReadStage, code: string | null | undefined): Error & { code: string } {
  const err = new Error(`loadImportKeys ${stage} read failed`) as Error & { code: string };
  err.code = safeCode(code) ?? "read_failed";
  return err;
}

/** SELECT … WHERE column IN (values) in bounded chunks, throwing on the first read error. */
async function selectInChunks(
  client: ImportReadClient,
  table: string,
  columns: string,
  column: string,
  values: string[],
  stage: ReadStage,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < values.length; i += IMPORT_LOOKUP_CHUNK) {
    const chunk = values.slice(i, i + IMPORT_LOOKUP_CHUNK);
    const { data, error } = await client.from(table).select(columns).in(column, chunk);
    if (error) throw readFailure(stage, error.code);
    for (const r of data ?? []) rows.push(r);
  }
  return rows;
}

/**
 * Which of these normalized emails/phones already exist in master (and are taggable), plus the active
 * suppression identities. Mirrors the ingest function's anti-join exactly (K-57): `existingEmails`
 * counts merged rows too (decides insert-vs-not); `taggableEmails` is the `merged_into IS NULL` subset
 * (decides tag-vs-skip, T-55).
 */
export async function loadImportKeys(
  client: ImportReadClient,
  emails: string[],
  phones: string[],
): Promise<ImportKeys> {
  const existingEmails = new Set<string>();
  const taggableEmails = new Set<string>();
  const existingPhones = new Set<string>();
  const suppressedEmails = new Set<string>();
  const suppressedPhones = new Set<string>();

  if (emails.length > 0) {
    const rows = await selectInChunks(client, "master_customer", "email_normalized, merged_into", "email_normalized", emails, "email");
    for (const r of rows) {
      const e = r.email_normalized as string | null;
      if (!e) continue;
      existingEmails.add(e);
      if (r.merged_into === null) taggableEmails.add(e);
    }
  }

  if (phones.length > 0) {
    const rows = await selectInChunks(client, "master_customer", "phone_normalized", "phone_normalized", phones, "phone");
    for (const r of rows) if (r.phone_normalized) existingPhones.add(r.phone_normalized as string);
  }

  // Active suppressions — small, no list filter, so no chunking; still fail-loud on error.
  const { data: sup, error: supErr } = await client
    .from("crm_suppression")
    .select("identity_kind, identity_key")
    .eq("status", "active");
  if (supErr) throw readFailure("suppression", supErr.code);
  for (const s of sup ?? []) {
    if (s.identity_kind === "email") suppressedEmails.add(s.identity_key as string);
    else if (s.identity_kind === "phone") suppressedPhones.add(s.identity_key as string);
  }

  return { existingEmails, taggableEmails, existingPhones, suppressedEmails, suppressedPhones };
}
