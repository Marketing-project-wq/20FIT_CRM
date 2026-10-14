import { NextResponse, type NextRequest } from "next/server";
import { parseCsvText } from "@/lib/crm/csv-parse";
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
import { importFailureMessage, MAX_IMPORT_ROWS, reconcileImport } from "@/lib/crm/import-audience";
import { buildImportDeps, finishImportExecute } from "@/lib/crm/import-audience-deps";

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
  if (!userId)
    return NextResponse.json(
      // A real message, not the UI's file-blaming fallback ("File tidak bisa dibaca"): a 401 is an
      // expired session, not a bad file (T-70 — the twelfth "cause discarded, replaced by a wrong
      // guess"; this time the guess blamed the user). Every ≥400 response on this route carries one.
      { error: "unauthenticated", message: "Sesi Anda berakhir — muat ulang halaman dan masuk lagi." },
      { status: 401 },
    );

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
  const b = body as { phase?: unknown; csvText?: unknown; mapping?: unknown; collectionSource?: unknown; filename?: unknown; extraTags?: unknown };
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

  // Parse on the SERVER via the ONE shared parser (T-73) — same papaparse config the manual email-list
  // CSV upload uses. Auto delimiter (handles the `;` CS files); a misdetection shows as delimiter + a
  // single header the operator can catch.
  const { headers, rows, delimiter } = parseCsvText(csvText);

  const admin = createAdminClient();
  const batchId = crypto.randomUUID();

  const deps: ImportDeps = buildImportDeps(admin, { userId, userEmail }, batchId);

  const input: ImportInput = {
    phase: phase as ImportPhase,
    headers,
    rows,
    mapping: (b.mapping as ImportInput["mapping"]) ?? undefined,
    collectionSource: typeof b.collectionSource === "string" ? b.collectionSource : undefined,
    filename: typeof b.filename === "string" ? b.filename : undefined,
    extraTags: Array.isArray(b.extraTags) ? (b.extraTags as string[]).filter((t) => typeof t === "string") : undefined,
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

  // Trim the plan before returning: the client needs summary + per-row outcomes + generated tag labels,
  // NOT insertRows (that is the bulk of the payload and carries the imported emails the browser already
  // has from its upload).
  const trimmed = result.plan
    ? { ...result, plan: { summary: result.plan.summary, outcomes: result.plan.outcomes, generatedTagLabels: result.plan.generatedTagLabels }, delimiter }
    : { ...result, delimiter };

  // A successful execute added people — refresh the read mirror so they appear in the pool/segments.
  if (result.phase === "execute" && result.committed && result.plan) {
    const reconciliation = reconcileImport(result.plan.summary, result.committed);
    if (!reconciliation.ok) {
      logApiFailure("/audience/import", "import_reconcile_mismatch", {
        code: `${reconciliation.actualInserted}/${reconciliation.expectedInserted}_${reconciliation.actualTagged}/${reconciliation.expectedTagged}`,
      });
    }
    const { mirrorRefreshed } = await finishImportExecute(admin, result.plan);
    // Not fatal to the import — the people are in; the mirror can be refreshed again. Report either way.
    return NextResponse.json(
      { ...trimmed, batch: batchId, mirrorRefreshed, reconciliation },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(trimmed, { headers: { "Cache-Control": "no-store" } });
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
      return "Tidak ada yang bisa dikerjakan: tak ada orang baru untuk dimasukkan dan tak ada yang sudah ada untuk ditandai. Semua baris tak valid, duplikat di dalam berkas, atau hanya cocok dengan profil yang sudah digabung.";
    default:
      return "Impor gagal.";
  }
}
