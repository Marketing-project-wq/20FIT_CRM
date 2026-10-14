import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiFailure } from "@/lib/crm/failure-log";
import { safeCode } from "@/lib/crm/safe-code";
import type { ImportDeps } from "@/lib/crm/import-audience-run";
import { loadImportKeys, type ImportReadClient } from "@/lib/crm/import-keys";
import type { ImportKeys, ImportPlan, NormalizedRow } from "@/lib/crm/import-audience";

/** Rows per RPC call. The RPC runs inside an 8 s statement_timeout; 500 rows ≈ 1–1,5 s (measured),
 *  leaving a wide margin. A 2.866-row file becomes 6 batches instead of one doomed call. */
const IMPORT_BATCH_SIZE = 500;

/**
 * The write side of the CSV audience import, EXTRACTED from app/api/audience/import so the same
 * reader / writer / audit serve both callers: the Audience import wizard (session) and Agent Mail's
 * import_audience tool (signed agent token). The planner (runImportRequest) is shared too — so dedup,
 * suppression, consent evidence and tag rules can never differ between the two.
 * `view` lands in the audit metadata so an agent import is distinguishable from a wizard import.
 */
export function buildImportDeps(
  admin: SupabaseClient,
  actor: { userId: string; userEmail: string | null },
  batchId: string,
  view = "audience_csv_import",
): ImportDeps {
  const userId = actor.userId;
  const userEmail = actor.userEmail;
  return {
    // Reads which of this batch's emails/phones already exist (+ suppressions). CHUNKED and FAIL-LOUD
    // (loadImportKeys, T-69): a single `.in()` over 1.432 emails built a ~58 KB URL the gateway rejected
    // with HTTP 400, and the old inline reader discarded that error — the swallow that shipped a half
    // import as success. Extracted to lib so it is unit-testable with a fake client.
    async loadKeys(emails, phones): Promise<ImportKeys> {
      return loadImportKeys(admin as unknown as ImportReadClient, emails, phones);
    },
    async commit(insertRows: NormalizedRow[], meta) {
      const num = (v: unknown) => (typeof v === "number" ? v : 0);
      let totalInserted = 0;
      let totalTagged = 0;
      let totalSharedBat = 0;
      let lastError: (Error & { code: string | null }) | null = null;
      let batchesFailed = 0;

      // Split insert rows into batches to stay under the 8 s statement_timeout.
      const batches: NormalizedRow[][] = [];
      for (let i = 0; i < insertRows.length; i += IMPORT_BATCH_SIZE) {
        batches.push(insertRows.slice(i, i + IMPORT_BATCH_SIZE));
      }
      // Tag-only import (0 inserts, N tags): still need one call for the tag targets.
      if (batches.length === 0) batches.push([]);

      for (let bi = 0; bi < batches.length; bi++) {
        const payload = batches[bi].map((r) => ({
          full_name: r.fullName,
          email: r.email,
          email_normalized: r.emailNormalized,
          phone_normalized: r.phoneNormalized,
          city: r.city,
          gender: r.gender,
          date_of_birth: r.dateOfBirth,
          blood_type: r.bloodType,
          tags: r.tags,
        }));
        try {
          const { data, error } = await admin.rpc("crm_ingest_csv_people", {
            p_rows: payload,
            p_batch_id: batchId,
            p_collection_source: meta.collectionSource,
            p_uploaded_by: userId,
            // Tag targets go with the FIRST batch only — they update existing people, independent
            // of the insert rows. Subsequent batches send an empty array.
            p_tag_rows: bi === 0 ? meta.tagTargets : [],
          });
          if (error) throw rpcFailure(error.code);
          const r = (data ?? {}) as { inserted?: number; tagged_existing?: number; shared_phone_in_batch?: number };
          totalInserted += num(r.inserted);
          totalTagged += num(r.tagged_existing);
          totalSharedBat += num(r.shared_phone_in_batch);
        } catch (e) {
          batchesFailed++;
          lastError = e as Error & { code: string | null };
          logApiFailure("/audience/import", "import_batch_failed", {
            code: safeCode((e as { code?: unknown } | null)?.code),
          });
        }
      }

      // All batches failed → throw so the caller sees the failure.
      if (batchesFailed === batches.length && lastError) throw lastError;

      return {
        inserted: totalInserted,
        taggedExisting: totalTagged,
        sharedPhoneInBatch: totalSharedBat,
      };
    },
    async audit(plan: ImportPlan, meta) {
      // PII-FREE: counts + provenance only, never the imported rows themselves.
      await admin.from("crm_audit_log").insert({
        actor_id: userId,
        actor_email: userEmail,
        action: "audience.imported",
        target_table: "master_customer",
        summary: `Impor CSV audiens: ${meta.inserted} masuk, ${plan.summary.taggedExisting} ditandai (sudah ada) — (${plan.summary.suppressed} kena suppression, ${plan.summary.sharedPhone} telepon bersama, ${plan.summary.sharedPhoneInBatch} telepon ganda dalam berkas), ${plan.summary.duplicatesInBatch} duplikat dalam berkas, ${plan.summary.sharedPhoneSuppressed} dilewati telepon ter-suppress, ${plan.summary.invalid} tak valid.`,
        metadata: {
          view,
          batch: batchId,
          collection_source: meta.collectionSource,
          filename: meta.filename,
          counts: plan.summary,
          inserted: meta.inserted,
        },
      });
    },
  };

}

/** After a successful execute: register generated tags and refresh the read mirror so the new people
 *  appear in the pool/segments. Neither is fatal to the import — the people are in. */
export async function finishImportExecute(admin: SupabaseClient, plan: ImportPlan): Promise<{ mirrorRefreshed: boolean }> {
  const genLabels = plan.generatedTagLabels;
  if (Object.keys(genLabels).length > 0) {
    const tagRows = Object.entries(genLabels).map(([tag, label]) => ({
      slug: tag,
      namespace: tag.slice(0, tag.indexOf(":")),
      label,
    }));
    const { error: regErr } = await admin.from("crm_tag_registry").upsert(tagRows, { onConflict: "slug", ignoreDuplicates: true });
    if (regErr) logApiFailure("/audience/import", "tag_registry_failed", { code: regErr.code });
  }
  const { error: refreshErr } = await admin.rpc("crm_refresh_customer_mirror");
  if (refreshErr) logApiFailure("/audience/import", "mirror_refresh_failed", { code: refreshErr.code });
  return { mirrorRefreshed: !refreshErr };
}

/** A failed RPC as a PII-free Error: the database's code as a property, a fixed message. Mirrors
 *  MailtrapSendError (T-41) — the code travels as data, never inside prose. */
function rpcFailure(code: string | null | undefined): Error & { code: string | null } {
  const err = new Error("crm_ingest_csv_people failed") as Error & { code: string | null };
  err.code = safeCode(code);
  return err;
}
