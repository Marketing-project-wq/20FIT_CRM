"use client";

import { useState } from "react";
import { Upload, FileText, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  IMPORT_TARGET_FIELDS,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportField,
  type ImportSummary,
} from "@/lib/crm/import-audience";

/**
 * CSV import wizard (Fase 1) — upload → map columns → review summary → confirm → report. It NEVER
 * writes on its own: "Hitung ringkasan" runs a server dry-run (writes nothing) and only "Konfirmasi &
 * impor" commits. Hardcoded Indonesian for Fase 1 (see the page docblock). Parsing happens on the
 * SERVER; the browser only sends the file's text.
 */

type Step = "upload" | "map" | "summary" | "report";

const FIELD_LABEL: Record<ImportField, string> = {
  full_name: "Nama lengkap",
  email: "Email",
  phone: "Telepon",
  city: "Kota",
  ignore: "— abaikan —",
};

interface AnalyzeResponse {
  ok: true;
  phase: "analyze";
  mapping: ColumnMapping;
  preview: Record<string, string>[];
  delimiter?: string;
}

/** Human-readable name for the delimiter papaparse detected, so the operator can sanity-check the parse
 *  (a `;` file misread as `,` is the classic silent misparse). */
const DELIMITER_LABEL: Record<string, string> = {
  ",": "koma (,)",
  ";": "titik koma (;)",
  "\t": "tab",
  "|": "garis tegak (|)",
};
function delimiterLabel(d: string): string {
  return DELIMITER_LABEL[d] ?? `"${d}"`;
}
interface DryRunResponse {
  ok: true;
  phase: "dry_run";
  mapping: ColumnMapping;
  preview: Record<string, string>[];
  plan: { summary: ImportSummary; outcomes: { index: number; status: string; email: string | null }[] };
}
interface ExecuteResponse {
  ok: true;
  phase: "execute";
  plan: { summary: ImportSummary; outcomes: { index: number; status: string; email: string | null }[] };
  committed: { inserted: number };
  batch: string;
  mirrorRefreshed: boolean;
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [delimiter, setDelimiter] = useState<string>(",");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dryOutcomes, setDryOutcomes] = useState<{ index: number; status: string; email: string | null }[]>([]);
  const [collectionSource, setCollectionSource] = useState("");
  const [report, setReport] = useState<ExecuteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(phase: "analyze" | "dry_run" | "execute", extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audience/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, csvText, filename, mapping, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Terjadi kesalahan. Coba lagi.");
        return null;
      }
      return data;
    } catch {
      setError("Gagal terhubung ke server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFilename(file.name);
    setCsvText(text);
    setError(null);
    // Analyze uses csvText directly (state may not be flushed yet), so post inline.
    setBusy(true);
    try {
      const res = await fetch("/api/audience/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "analyze", csvText: text, filename: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "File tidak bisa dibaca.");
        return;
      }
      const a = data as AnalyzeResponse;
      setHeaders(Object.keys(a.mapping));
      setMapping(a.mapping);
      setPreview(a.preview);
      if (a.delimiter) setDelimiter(a.delimiter);
      setStep("map");
    } catch {
      setError("Gagal membaca file.");
    } finally {
      setBusy(false);
    }
  }

  async function runDryRun() {
    const data = (await post("dry_run")) as DryRunResponse | null;
    if (!data) return;
    setSummary(data.plan.summary);
    setDryOutcomes(data.plan.outcomes ?? []);
    setPreview(data.preview);
    setStep("summary");
  }

  async function runExecute() {
    const data = (await post("execute", { collectionSource })) as ExecuteResponse | null;
    if (!data) return;
    setReport(data);
    setStep("report");
  }

  function reset() {
    setStep("upload");
    setFilename("");
    setCsvText("");
    setHeaders([]);
    setMapping({});
    setPreview([]);
    setDelimiter(",");
    setSummary(null);
    setDryOutcomes([]);
    setCollectionSource("");
    setReport(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Impor Audiens</h1>
        <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">
          Unggah CSV berisi kontak yang consent-nya sudah diberikan di titik pengumpulan. Anda memetakan kolom,
          melihat ringkasan, lalu mengonfirmasi — impor tidak berjalan otomatis. Maks {MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris.
        </p>
      </header>

      <Stepper step={step} />

      {error && (
        <p className="tint-red flex items-center gap-2 rounded-sm px-3 py-2 font-body text-[13px]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {step === "upload" && (
        <div className="glass rounded-card p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-16 text-center hover:border-red">
            <Upload className="h-8 w-8 text-ink-faint" aria-hidden />
            <span className="font-display text-[14px] font-bold text-ink">Pilih file CSV</span>
            <span className="font-body text-[12px] text-ink-soft">
              Kolom yang didukung: nama, email, telepon, kota. Email wajib. Excel menyusul.
            </span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} disabled={busy} />
          </label>
        </div>
      )}

      {step === "map" && (
        <div className="glass rounded-card p-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-ink-soft" aria-hidden />
              <span className="font-body text-[13px] text-ink">{filename}</span>
            </span>
            <span className="font-body text-[12px] text-ink-faint">
              Pemisah terdeteksi: {delimiterLabel(delimiter)} · {headers.length} kolom
            </span>
          </div>
          <p className="mb-4 font-body text-[13px] text-ink-soft">
            Pasangkan tiap kolom CSV ke field tujuan. Tebakan otomatis dari nama kolom — ubah bila perlu. Setidaknya
            satu kolom harus dipetakan ke <strong>Email</strong>.{" "}
            {headers.length <= 1 && (
              <span className="text-amber">
                Hanya satu kolom terbaca — kalau file Anda pakai titik koma atau tab, pemisahnya mungkin salah dibaca.
                Buka file dan periksa pemisahnya.
              </span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="py-2 pr-4 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Kolom CSV</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Petakan ke</th>
                  <th className="py-2 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Contoh</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => (
                  <tr key={h} className="border-b border-glass-border/50">
                    <td className="py-2 pr-4 font-body text-[13px] text-ink">{h || <em className="text-ink-faint">(tanpa nama)</em>}</td>
                    <td className="py-2 pr-4">
                      <select
                        className="h-9 rounded-sm border border-glass-border bg-glass px-2 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
                        value={mapping[h] ?? "ignore"}
                        onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ImportField }))}
                      >
                        {IMPORT_TARGET_FIELDS.map((f) => (
                          <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 font-body text-[12px] text-ink-soft">{preview[0]?.[h] ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Button variant="outline" onClick={reset}>← Ganti file</Button>
            <Button onClick={runDryRun} disabled={busy}>
              {busy ? "Menghitung…" : "Hitung ringkasan"}<ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "summary" && summary && (
        <div className="glass rounded-card p-6">
          <p className="mb-4 font-body text-[13px] text-ink-soft">
            Ringkasan sebelum impor. Belum ada yang ditulis. Periksa angkanya, isi sumber pengumpulan, lalu konfirmasi.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Baris terbaca" value={summary.read} />
            <Stat label="Email valid" value={summary.validEmail} />
            <Stat label="Akan masuk" value={summary.netInsert} tone="green" />
            <Stat label="Bisa dikirimi" value={summary.netContactable} tone="green" />
            <Stat label="Kena suppression" value={summary.suppressed} tone="amber" hint="Masuk pool, tapi tak akan menerima kiriman" />
            <Stat label="Telepon bersama" value={summary.sharedPhone} tone="amber" hint="Tetap masuk (email unik), tapi teleponnya sama dengan kontak yang sudah ada" />
            {summary.sharedPhoneSuppressed > 0 && (
              <Stat
                label="Dilewati — telepon ter-suppress"
                value={summary.sharedPhoneSuppressed}
                tone="amber"
                hint="Teleponnya sama dengan kontak yang sudah berhenti berlangganan — tidak diimpor demi menepati permintaan stop"
              />
            )}
            <Stat label="Duplikat email (dilewati)" value={summary.duplicatesEmail + summary.duplicatesInBatch} />
            <Stat label="Tak valid (tanpa email)" value={summary.invalid} />
            {summary.phoneExcelBroken > 0 && (
              <Stat
                label="Telepon rusak (format Excel)"
                value={summary.phoneExcelBroken}
                tone="amber"
                hint="Teleponnya jadi notasi ilmiah — angkanya hilang, tak bisa dipakai"
              />
            )}
          </div>

          {summary.phoneExcelBroken > 0 && (
            <p className="tint-amber mt-3 flex items-start gap-2 rounded-sm px-3 py-2 font-body text-[12px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {summary.phoneExcelBroken.toLocaleString("id-ID")} baris punya telepon yang Excel ubah jadi notasi
                ilmiah (mis. “6,28129E+12”) — angka aslinya <strong>hilang permanen</strong>, jadi teleponnya
                dikosongkan (tidak ditebak). Barisnya tetap masuk kalau emailnya valid. Untuk memperbaiki: di Excel,
                format kolom telepon sebagai <strong>Teks</strong> dulu sebelum menyimpan CSV, lalu ekspor ulang.
              </span>
            </p>
          )}

          <UnmappedColumns headers={headers} mapping={mapping} />

          {/* Per-row reasons BEFORE confirming — checking why each row is skipped/flagged is the point
              of a dry-run. Shows skips AND the shared-phone / suppressed inserts, each with its reason. */}
          <ProblemList outcomes={dryOutcomes} />

          <div className="mt-6">
            <label className="mb-1 block font-display text-[13px] font-bold text-ink">
              Sumber pengumpulan <span className="text-red">*</span>
            </label>
            <p className="mb-2 font-body text-[12px] text-ink-soft">
              Wajib. Dari mana daftar ini berasal — mis. “Pendaftaran Sportfest 2 — formulir cetak”. Disimpan sebagai
              bukti consent (bukan gerbang).
            </p>
            <input
              type="text"
              value={collectionSource}
              onChange={(e) => setCollectionSource(e.target.value)}
              placeholder="Deskripsi konkret asal daftar"
              className="h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
              maxLength={200}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setStep("map")}>← Kembali ke pemetaan</Button>
            <Button
              onClick={runExecute}
              disabled={busy || collectionSource.trim() === "" || summary.netInsert === 0}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Mengimpor…" : `Konfirmasi & impor ${summary.netInsert.toLocaleString("id-ID")} orang`}
            </Button>
            {/* Say WHY the confirm button is inert — never a silent dead button (K-55). */}
            {collectionSource.trim() === "" && summary.netInsert > 0 && (
              <span className="font-body text-[12px] text-ink-faint">Isi “sumber pengumpulan” untuk mengaktifkan.</span>
            )}
          </div>
        </div>
      )}

      {step === "report" && report && (
        <div className="glass rounded-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green" aria-hidden />
            <span className="font-display text-[15px] font-bold text-ink">Impor selesai</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Berhasil masuk" value={report.committed.inserted} tone="green" />
            <Stat label="Kena suppression" value={report.plan.summary.suppressed} tone="amber" hint="Masuk, tapi takkan dikirimi" />
            <Stat label="Telepon bersama" value={report.plan.summary.sharedPhone} tone="amber" hint="Masuk, teleponnya sama dengan kontak lain" />
            <Stat label="Dilewati / tak valid" value={report.plan.summary.duplicatesEmail + report.plan.summary.duplicatesInBatch + report.plan.summary.invalid + report.plan.summary.sharedPhoneSuppressed} />
            {report.plan.summary.phoneExcelBroken > 0 && (
              <Stat label="Telepon rusak (format Excel)" value={report.plan.summary.phoneExcelBroken} tone="amber" hint="Teleponnya dikosongkan — angkanya hilang" />
            )}
          </div>
          <p className="mt-4 font-body text-[12px] text-ink-soft">
            Batch <span className="font-mono">{report.batch}</span>. {report.mirrorRefreshed ? "Pool sudah diperbarui." : "Pool akan diperbarui pada refresh berikutnya."}
          </p>
          <ProblemList outcomes={report.plan.outcomes} />
          <div className="mt-5">
            <Button variant="outline" onClick={reset}>Impor file lain</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "1. Unggah" },
    { key: "map", label: "2. Petakan" },
    { key: "summary", label: "3. Ringkasan" },
    { key: "report", label: "4. Laporan" },
  ];
  const order: Step[] = ["upload", "map", "summary", "report"];
  const current = order.indexOf(step);
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <span
          key={s.key}
          className={`rounded-full px-3 py-1 font-body text-[12px] ${
            i === current ? "bg-red text-white" : i < current ? "bg-glass text-ink-soft" : "bg-glass text-ink-faint"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: "green" | "amber"; hint?: string }) {
  const color = tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "text-ink";
  return (
    <div className="rounded-card border border-glass-border bg-glass p-3">
      <div className={`font-display text-[24px] font-black leading-none ${color}`}>{value.toLocaleString("id-ID")}</div>
      <div className="mt-1 font-body text-[12px] text-ink-soft">{label}</div>
      {hint && <div className="mt-0.5 font-body text-[11px] text-ink-faint">{hint}</div>}
    </div>
  );
}

/** Which uploaded columns were NOT imported (mapped to "ignore"). Surfaced so the operator sees, e.g.,
 *  that an "Event" column was left out — a silent drop is how data quietly goes missing. Names only,
 *  no values. */
function UnmappedColumns({ headers, mapping }: { headers: string[]; mapping: ColumnMapping }) {
  const ignored = headers.filter((h) => (mapping[h] ?? "ignore") === "ignore" && h.trim() !== "");
  if (ignored.length === 0) return null;
  return (
    <p className="mt-3 font-body text-[12px] text-ink-soft">
      Kolom tidak diimpor ({ignored.length}):{" "}
      <span className="text-ink">{ignored.join(", ")}</span>. Hanya nama, email, telepon, dan kota yang masuk — sisanya
      diabaikan. Kalau salah satunya seharusnya ikut, kembali ke pemetaan.
    </p>
  );
}

/** Per-row reasons. Lists every row that is NOT a plain insert — both SKIPS and flagged inserts
 *  (shared phone / suppressed) — each with its reason. The dedup match field is explicit (email vs
 *  phone) so the operator can tell an unambiguous email duplicate from a shared-number flag. It never
 *  shows WHO the row collided with — exposing another customer to the uploader is a separate,
 *  audited decision (K-55). Row number is +2: 1 for the header, 1 for 0-based index. */
function ProblemList({ outcomes }: { outcomes: { index: number; status: string; email: string | null }[] }) {
  const rows = outcomes.filter((o) => o.status !== "insert");
  if (rows.length === 0) return null;
  const LABEL: Record<string, string> = {
    skip_duplicate_email: "Email sudah ada (dilewati)",
    skip_duplicate_in_batch: "Email dobel di file ini (dilewati)",
    skip_invalid: "Email tidak valid (dilewati)",
    skip_shared_phone_suppressed: "Telepon ter-suppress (dilewati — tak dibuat kontak baru)",
    insert_shared_phone: "Telepon cocok kontak lain (tetap masuk)",
    insert_suppressed: "Kena suppression (masuk, takkan dikirimi)",
  };
  return (
    <details className="mt-4">
      <summary className="cursor-pointer font-body text-[13px] text-ink-soft">Lihat baris yang dilewati atau ditandai ({rows.length})</summary>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-sm border border-glass-border">
        <table className="w-full border-collapse text-left">
          <tbody>
            {rows.slice(0, 500).map((p) => (
              <tr key={p.index} className="border-b border-glass-border/50">
                <td className="px-3 py-1.5 font-mono text-[12px] text-ink-faint">baris {p.index + 2}</td>
                <td className="px-3 py-1.5 font-body text-[12px] text-ink">{p.email ?? "—"}</td>
                <td className="px-3 py-1.5 font-body text-[12px] text-ink-soft">{LABEL[p.status] ?? p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
