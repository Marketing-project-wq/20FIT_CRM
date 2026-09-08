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
import { importFailureMessage, MAX_IMPORT_ROWS } from "@/lib/crm/import-audience";
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
  // papaparse auto-detects the delimiter (it tries , \t | ; and picks the one giving the most consistent
  // column count). We surface its choice so the operator can catch the rare misdetection — e.g. a `;`
  // file where every value landed in one column would show delimiter="," here and a single header.
  const delimiter = parsed.meta.delimiter || ",";

  const admin = createAdminClient();
  const batchId = crypto.randomUUID();

  const deps: ImportDeps = {
    async loadKeys(emails, phones): Promise<ImportKeys> {
      const existingEmails = new Set<string>();
      // (T-55) Taggable = at least one row for this email whose `merged_into` IS NULL. Kept apart from
      // existingEmails on purpose: existingEmails decides INSERT-or-not and must mirror the ingest
      // function's anti-join (which counts merged rows too), while THIS set decides TAG-or-not and must
      // mirror its `upd` filter (which does not). One set could only satisfy one of the two, and the
      // half it got wrong would be wrong in silence.
      const taggableEmails = new Set<string>();
      const existingPhones = new Set<string>();
      const suppressedEmails = new Set<string>();
      const suppressedPhones = new Set<string>();
      // Which of THIS batch's emails/phones already exist in master (bounded by the batch, not 82k).
      if (emails.length > 0) {
        const { data, error } = await admin
          .from("master_customer")
          .select("email_normalized, merged_into")
          .in("email_normalized", emails);
        if (error) throw readFailure("email", error.code);
        for (const r of data ?? []) {
          const e = r.email_normalized as string | null;
          if (!e) continue;
          existingEmails.add(e);
          if (r.merged_into === null) taggableEmails.add(e);
        }
      }
      if (phones.length > 0) {
        const { data, error } = await admin.from("master_customer").select("phone_normalized").in("phone_normalized", phones);
        if (error) throw readFailure("phone", error.code);
        for (const r of data ?? []) if (r.phone_normalized) existingPhones.add(r.phone_normalized as string);
      }
      // Active suppressions (small) — keyed by normalized identity.
      const { data: sup, error: supErr } = await admin
        .from("crm_suppression")
        .select("identity_kind, identity_key")
        .eq("status", "active");
      if (supErr) throw readFailure("suppression", supErr.code);
      for (const s of sup ?? []) {
        if (s.identity_kind === "email") suppressedEmails.add(s.identity_key as string);
        else if (s.identity_kind === "phone") suppressedPhones.add(s.identity_key as string);
      }
      return { existingEmails, taggableEmails, existingPhones, suppressedEmails, suppressedPhones };
    },
    async commit(insertRows: NormalizedRow[], meta) {
      const payload = insertRows.map((r) => ({
        full_name: r.fullName,
        email: r.email,
        email_normalized: r.emailNormalized,
        phone_normalized: r.phoneNormalized,
        city: r.city,
        tags: r.tags, // per row — even one event file carries different format:/kategori:/nilai: tags
      }));
      const { data, error } = await admin.rpc("crm_ingest_csv_people", {
        p_rows: payload,
        p_batch_id: batchId,
        p_collection_source: meta.collectionSource,
        p_uploaded_by: userId,
        // Decided by the planner, never re-derived in SQL — the dry-run count and the write act on
        // the SAME list (K-58). Phone-only matches are NOT here: they are different people, inserted.
        p_tag_rows: meta.tagTargets,
      });
      // PII-FREE: carry the database's CODE, never its message. A Postgres error message can quote
      // the offending row ("Key (email_normalized)=(…) already exists") — see safeCode.
      if (error) throw rpcFailure(error.code);
      const r = (data ?? {}) as { inserted?: number; tagged_existing?: number; shared_phone_in_batch?: number };
      const num = (v: unknown) => (typeof v === "number" ? v : 0);
      return {
        inserted: num(r.inserted),
        taggedExisting: num(r.tagged_existing),
        sharedPhoneInBatch: num(r.shared_phone_in_batch),
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
  const trimmed = result.plan
    ? { ...result, plan: { summary: result.plan.summary, outcomes: result.plan.outcomes }, delimiter }
    : { ...result, delimiter };

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

/**
 * A failed loadKeys READ, as a PII-free Error carrying the DB code. Import MUST fail loud on a read
 * error, never proceed with empty keys. Empty keys make planImport treat every row as net-new, so the
 * ingest anti-join silently skips everyone already in the pool — a HALF import reported as success.
 * This shipped (T-69, 8 Sep 2026): a ~24 KB `.in(email…)` URL for a >550-row file returned HTTP 400,
 * the error was discarded by `const { data } =`, and 1.432-row files imported ~half with ZERO tagging
 * under a green check. Throwing here turns that silent lie into an honest failure (TUGAS 4: because
 * loadKeys is the first dep call, a throw aborts the request before any write — zero partial writes). */
function readFailure(stage: "email" | "phone" | "suppression", code: string | null | undefined): Error & { code: string } {
  const err = new Error(`loadKeys ${stage} read failed`) as Error & { code: string };
  err.code = safeCode(code) ?? "read_failed";
  return err;
}

function errorMessage(code: string): string {
  switch (code) {
    case "empty_file":
      return "File kosong atau tidak terbaca.";
    case "too_many_rows":
      return `Terlalu banyak baris. Batas terukur adalah ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris per file — impor berjalan di anggaran waktu database 8 detik. Pecah file menjadi beberapa bagian di bawah ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris, lalu impor bergiliran.`;
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
