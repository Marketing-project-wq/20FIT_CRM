import { NextResponse, type NextRequest } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canImportAudience } from "@/lib/auth/roles";
import { logApiFailure } from "@/lib/crm/failure-log";
import { safeCode } from "@/lib/crm/safe-code";
import {
  runImportRequest,
  type ImportDeps,
  type ImportInput,
  type ImportPhase,
} from "@/lib/crm/import-audience-run";
import { importFailureMessage } from "@/lib/crm/import-audience";
import type { ImportKeys, ImportPlan, NormalizedRow } from "@/lib/crm/import-audience";

export const dynamic = "force-dynamic";
// Advisory ceiling; Railway does not enforce it (persistent server). The real bounds are the row cap
// (MAX_IMPORT_ROWS) and the CSV-text size guard below.
export const maxDuration = 60;

const MAX_CSV_BYTES = 15 * 1024 * 1024; // 15 MB of text — well above a 20k-row contact CSV, blocks abuse
const PHASES: ReadonlySet<string> = new Set<ImportPhase>(["analyze", "dry_run", "execute"]);

/**
 * CSV audience import (Fase 1). ONE route, three phases (analyze → dry_run → execute). The server
 * parses the CSV (papaparse), plans via the pure planner, and — only on `execute` — writes through the
 * service-role-only crm_ingest_csv_people RPC, then records an audit row and refreshes the read mirror.
 *
 * SAFETY: super-admin only (canImportAudience). The dry-run writes nothing (proven in
 * import-audience-run.test). Imported people are contactable (K-36) with consent EVIDENCE, deduped
 * skip-only, and never revive a suppressed contact (suppression is checked at send by normalized
 * identity). See docs/RENCANA-impor-audiens.md.
 */
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const role = await getCurrentUserRole();
  if (!canImportAudience(role)) {
    return NextResponse.json(
      { error: "forbidden", message: "Impor audiens hanya untuk Super Admin." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body bukan JSON yang valid." }, { status: 400 });
  }
  const b = body as { phase?: unknown; csvText?: unknown; mapping?: unknown; collectionSource?: unknown; filename?: unknown };
  const phase = String(b.phase ?? "");
  if (!PHASES.has(phase)) {
    return NextResponse.json({ error: "bad_request", message: "Fase tidak dikenal." }, { status: 400 });
  }
  const csvText = typeof b.csvText === "string" ? b.csvText : "";
  if (csvText.trim() === "") {
    return NextResponse.json({ error: "bad_request", message: "File kosong atau tidak terbaca." }, { status: 400 });
  }
  if (Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "too_large", message: "File terlalu besar (maks 15 MB)." }, { status: 413 });
  }

  // Parse on the SERVER (papaparse) — headered records, empty lines skipped. papaparse handles quoting,
  // embedded commas/newlines, and a leading BOM.
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: "greedy" });
  const headers = (parsed.meta.fields ?? []).map((h) => h.trim());
  const rows = (parsed.data ?? []).filter((r) => r && typeof r === "object");

  const admin = createAdminClient();
  const batchId = crypto.randomUUID();

  const deps: ImportDeps = {
    async loadKeys(emails, phones): Promise<ImportKeys> {
      const existingEmails = new Set<string>();
      const existingPhones = new Set<string>();
      const suppressedEmails = new Set<string>();
      const suppressedPhones = new Set<string>();
      // Which of THIS batch's emails/phones already exist in master (bounded by the batch, not 82k).
      if (emails.length > 0) {
        const { data } = await admin.from("master_customer").select("email_normalized").in("email_normalized", emails);
        for (const r of data ?? []) if (r.email_normalized) existingEmails.add(r.email_normalized as string);
      }
      if (phones.length > 0) {
        const { data } = await admin.from("master_customer").select("phone_normalized").in("phone_normalized", phones);
        for (const r of data ?? []) if (r.phone_normalized) existingPhones.add(r.phone_normalized as string);
      }
      // Active suppressions (small) — keyed by normalized identity.
      const { data: sup } = await admin
        .from("crm_suppression")
        .select("identity_kind, identity_key")
        .eq("status", "active");
      for (const s of sup ?? []) {
        if (s.identity_kind === "email") suppressedEmails.add(s.identity_key as string);
        else if (s.identity_kind === "phone") suppressedPhones.add(s.identity_key as string);
      }
      return { existingEmails, existingPhones, suppressedEmails, suppressedPhones };
    },
    async commit(insertRows: NormalizedRow[], meta) {
      const payload = insertRows.map((r) => ({
        full_name: r.fullName,
        email: r.email,
        email_normalized: r.emailNormalized,
        phone_normalized: r.phoneNormalized,
        city: r.city,
      }));
      const { data, error } = await admin.rpc("crm_ingest_csv_people", {
        p_rows: payload,
        p_batch_id: batchId,
        p_collection_source: meta.collectionSource,
        p_uploaded_by: userId,
      });
      // PII-FREE: carry the database's CODE, never its message. A Postgres error message can quote
      // the offending row ("Key (email_normalized)=(…) already exists") — see safeCode.
      if (error) throw rpcFailure(error.code);
      const inserted = typeof (data as { inserted?: number })?.inserted === "number" ? (data as { inserted: number }).inserted : 0;
      return { inserted };
    },
    async audit(plan: ImportPlan, meta) {
      // PII-FREE: counts + provenance only, never the imported rows themselves.
      await admin.from("crm_audit_log").insert({
        actor_id: userId,
        actor_email: userEmail,
        action: "audience.imported",
        target_table: "master_customer",
        summary: `Impor CSV audiens: ${meta.inserted} masuk (${plan.summary.suppressed} kena suppression), ${plan.summary.duplicatesExisting + plan.summary.duplicatesInBatch} duplikat, ${plan.summary.invalid} tak valid.`,
        metadata: {
          view: "audience_csv_import",
          batch: batchId,
          collection_source: meta.collectionSource,
          filename: meta.filename,
          counts: plan.summary,
          inserted: meta.inserted,
        },
      });
    },
  };

  const input: ImportInput = {
    phase: phase as ImportPhase,
    headers,
    rows,
    mapping: (b.mapping as ImportInput["mapping"]) ?? undefined,
    collectionSource: typeof b.collectionSource === "string" ? b.collectionSource : undefined,
    filename: typeof b.filename === "string" ? b.filename : undefined,
  };

  let result;
  try {
    result = await runImportRequest(input, deps);
  } catch (e) {
    // The code, shape-guarded. NOT e.message: this used to be `e.message.slice(0, 60)`, which fed
    // free Postgres prose into a field typed as a code — a PII leak, not just a bad message (T-49).
    const code = safeCode((e as { code?: unknown } | null)?.code);
    logApiFailure("/audience/import", "import_failed", { code });
    return NextResponse.json(
      { error: "import_failed", code, message: importFailureMessage(code) },
      { status: 500 },
    );
  }

  if (!result.ok) {
    const message = errorMessage(result.error);
    return NextResponse.json({ error: result.error, message }, { status: result.error === "too_many_rows" || result.error === "collection_source_required" || result.error === "no_email_column" ? 422 : 400 });
  }

  // Trim the plan before returning: the client needs summary + per-row outcomes, NOT insertRows (that
  // is the bulk of the payload and carries the imported emails the browser already has from its upload).
  const trimmed = result.plan ? { ...result, plan: { summary: result.plan.summary, outcomes: result.plan.outcomes } } : result;

  // A successful execute added people — refresh the read mirror so they appear in the pool/segments.
  if (result.phase === "execute" && result.committed) {
    const { error: refreshErr } = await admin.rpc("crm_refresh_customer_mirror");
    if (refreshErr) logApiFailure("/audience/import", "mirror_refresh_failed", { code: refreshErr.code });
    // Not fatal to the import — the people are in; the mirror can be refreshed again. Report either way.
    return NextResponse.json(
      { ...trimmed, batch: batchId, mirrorRefreshed: !refreshErr },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(trimmed, { headers: { "Cache-Control": "no-store" } });
}

/** A failed RPC as a PII-free Error: the database's code as a property, a fixed message. Mirrors
 *  MailtrapSendError (T-41) — the code travels as data, never inside prose. */
function rpcFailure(code: string | null | undefined): Error & { code: string | null } {
  const err = new Error("crm_ingest_csv_people failed") as Error & { code: string | null };
  err.code = safeCode(code);
  return err;
}

function errorMessage(code: string): string {
  switch (code) {
    case "empty_file":
      return "File kosong atau tidak terbaca.";
    case "too_many_rows":
      return "Terlalu banyak baris. Batas Fase 1 adalah 20.000 baris per file.";
    case "no_email_column":
      return "Petakan salah satu kolom ke Email — email wajib sebagai identitas dan kunci duplikat.";
    case "collection_source_required":
      return "Isi dulu 'sumber pengumpulan' — dari mana daftar ini berasal.";
    case "nothing_to_import":
      return "Tidak ada baris baru untuk dimasukkan (semua duplikat atau tak valid).";
    default:
      return "Impor gagal.";
  }
}
