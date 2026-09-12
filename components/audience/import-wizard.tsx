"use client";

import { useState } from "react";
import { Upload, FileText, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_IMPORT_ROWS,
  NAMESPACE_MAPPING_TARGETS,
  importActionableTotal,
  canRunImport,
  type ColumnMapping,
  type MappingTarget,
  type ImportSummary,
} from "@/lib/crm/import-audience";
import { parseTagCell, groupTags, namespaceLabel, tagValueLabel, slugifyTagValue } from "@/lib/crm/tags";

/**
 * CSV import wizard (Fase 1) — upload → map columns → review summary → confirm → report. It NEVER
 * writes on its own: "Hitung ringkasan" runs a server dry-run (writes nothing) and only "Konfirmasi &
 * impor" commits. Hardcoded Indonesian for Fase 1 (see the page docblock). Parsing happens on the
 * SERVER; the browser only sends the file's text.
 */

type Step = "upload" | "map" | "summary" | "report";

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
  plan: {
    summary: ImportSummary;
    outcomes: { index: number; status: string; email: string | null }[];
    generatedTagLabels?: Record<string, string>;
  };
}
interface RowOutcomeView {
  index: number;
  status: string;
  email: string | null;
  invalidTags?: string[];
}

interface ExecuteResponse {
  ok: true;
  phase: "execute";
  plan: { summary: ImportSummary; outcomes: RowOutcomeView[] };
  committed: { inserted: number; taggedExisting: number; sharedPhoneInBatch: number };
  batch: string;
  mirrorRefreshed: boolean;
  // Honest report (T-69): did the write match the plan? When ok is false the header is a WARNING, not
  // a green check — people were dropped between plan and write and the operator must see it.
  reconciliation: {
    ok: boolean;
    expectedInserted: number;
    actualInserted: number;
    expectedTagged: number;
    actualTagged: number;
  };
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
  const [dryOutcomes, setDryOutcomes] = useState<RowOutcomeView[]>([]);
  const [collectionSource, setCollectionSource] = useState("");
  const [report, setReport] = useState<ExecuteResponse | null>(null);
  const [generatedTagLabels, setGeneratedTagLabels] = useState<Record<string, string>>({});
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
    setGeneratedTagLabels(data.plan.generatedTagLabels ?? {});
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
    setGeneratedTagLabels({});
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
          melihat ringkasan, lalu mengonfirmasi — impor tidak berjalan otomatis.
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
          {/* Batas dinyatakan DI LANGKAH UNGGAH, bukan hanya di pesan galat — supaya pemilik tahu
              file terlalu besar SEBELUM menunggu. Angka + alasannya (anggaran 8 detik) sengaja
              disebut bersama: angka yang punya alasan lebih mudah dipercaya. Batas ini terukur,
              bukan tebakan — lihat MAX_IMPORT_ROWS. */}
          <p className="mt-4 font-body text-[12px] leading-relaxed text-ink-soft">
            Maks <strong>{MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris</strong> per file. Impor berjalan
            di anggaran waktu database <strong>8 detik</strong> — itu sebabnya ada batas. File lebih besar
            dari itu: pecah jadi beberapa bagian di bawah {MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris,
            lalu impor bergiliran.
          </p>
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
                        onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as MappingTarget }))}
                      >
                        <option value="email">Email</option>
                        <option value="full_name">Nama lengkap</option>
                        <option value="tags">Tag (mentah)</option>
                        <option value="ignore">— abaikan —</option>
                        <optgroup label="Petakan ke namespace tag">
                          {NAMESPACE_MAPPING_TARGETS.map((ns) => (
                            <option key={ns} value={`ns:${ns}`}>→ Tag {namespaceLabel(ns, "id")} ({ns}:)</option>
                          ))}
                        </optgroup>
                      </select>
                    </td>
                    <td className="py-2 font-body text-[12px] text-ink-soft">
                      {mapping[h] === "tags"
                        ? <TagSample raw={preview[0]?.[h] ?? ""} />
                        : (mapping[h] ?? "").startsWith("ns:")
                          ? <NsTagPreview namespace={(mapping[h] as string).slice(3)} values={preview.map(r => r[h]).filter(Boolean)} />
                          : (preview[0]?.[h] ?? "")}
                    </td>
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
            {/* The four figures the operator must be able to tell apart BEFORE confirming. "Akan
                ditandai" is the population the tag work exists for — people already in the pool who
                get this batch's tags and nothing else — and it is deliberately NOT folded into the
                skipped count: they are not skipped, something happens to them. */}
            <Stat
              label="Akan ditandai (sudah ada)"
              value={summary.taggedExisting}
              tone="blue"
              hint="Sudah ada di pool — tidak diimpor ulang. Hanya tag batch ini yang ditambahkan; kolom lain tak disentuh"
            />
            <Stat label="Bisa dikirimi" value={summary.netContactable} tone="green" />
            <Stat label="Kena suppression" value={summary.suppressed} tone="amber" hint="Masuk pool, tapi tak akan menerima kiriman" />
            <Stat label="Telepon bersama (kontak lain)" value={summary.sharedPhone} tone="amber" hint="Tetap masuk (email unik), tapi teleponnya sama dengan kontak yang SUDAH ADA — teleponnya dikosongkan saat ditulis" />
            <Stat label="Telepon ganda dalam berkas" value={summary.sharedPhoneInBatch} tone="amber" hint="Nomor sama dipakai lebih dari satu baris DI BERKAS INI — telepon dikosongkan di semua baris itu" />
            {summary.sharedPhoneSuppressed > 0 && (
              <Stat
                label="Dilewati — telepon ter-suppress"
                value={summary.sharedPhoneSuppressed}
                tone="amber"
                hint="Teleponnya sama dengan kontak yang sudah berhenti berlangganan — tidak diimpor demi menepati permintaan stop"
              />
            )}
            {/* T-55. Shown only when it fires, but NEVER folded into another figure when it does: the
                whole point of counting it is that "Akan ditandai" going down must have a visible
                reason. A person who was merged is not tagged — their data moved to another profile. */}
            {summary.skippedMerged > 0 && (
              <Stat
                label="Dilewati — profil sudah digabung"
                value={summary.skippedMerged}
                tone="amber"
                hint="Emailnya hanya cocok dengan profil yang sudah digabung ke profil lain. Tidak diimpor dan tidak ditandai — datanya sudah pindah"
              />
            )}
            <Stat label="Duplikat dalam berkas (dilewati)" value={summary.duplicatesInBatch} hint="Email yang sama muncul lebih dari sekali di berkas ini" />
            {summary.rowsWithInvalidTags > 0 && (
              <Stat
                label="Baris dengan tag ditolak"
                value={summary.rowsWithInvalidTags}
                tone="amber"
                hint="Tag di luar kosakata dibuang; barisnya tetap diproses dengan tag yang sah — lihat daftar di bawah"
              />
            )}
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

          {Object.keys(generatedTagLabels).length > 0 && (
            <NamespaceTagStats labels={generatedTagLabels} />
          )}

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
              disabled={busy || !canRunImport(summary, collectionSource)}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Mengimpor…"
                : `Konfirmasi · ${summary.netInsert.toLocaleString("id-ID")} masuk, ${summary.taggedExisting.toLocaleString("id-ID")} ditandai`}
            </Button>
            {/* Say WHY the confirm button is inert — never a silent dead button (K-57). Two distinct
                reasons, never merged: nothing-to-do (T-67 — a file whose rows are ALL already in the
                pool still tags them, so the gate is netInsert+taggedExisting, not netInsert), and a
                missing collection source. */}
            {importActionableTotal(summary) === 0 && (
              <span className="font-body text-[12px] text-ink-faint">
                Tak ada yang berubah — 0 masuk dan 0 ditandai. Tak ada yang bisa dikonfirmasi.
              </span>
            )}
            {importActionableTotal(summary) > 0 && collectionSource.trim() === "" && (
              <span className="font-body text-[12px] text-ink-faint">Isi “sumber pengumpulan” untuk mengaktifkan.</span>
            )}
          </div>
        </div>
      )}

      {step === "report" && report && (
        <div className="glass rounded-card p-6">
          {report.reconciliation.ok ? (
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green" aria-hidden />
              <span className="font-display text-[15px] font-bold text-ink">Impor selesai</span>
            </div>
          ) : (
            /* Rencana ≠ hasil: orang menguap di antara rencana dan tulisan. JANGAN centang hijau —
               inilah kelas bug 8 Sep (857 dari 1.432 dilaporkan "selesai"). Sebutkan angkanya. */
            <div className="mb-4 tint-red rounded-sm px-4 py-3" role="alert">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red" aria-hidden />
                <span className="font-display text-[15px] font-bold text-ink">Impor TIDAK lengkap — perlu ditinjau</span>
              </div>
              <p className="mt-2 font-body text-[13px] leading-relaxed text-ink">
                Yang direncanakan tidak sama dengan yang ditulis database. Sebagian orang mungkin tidak
                masuk atau tidak ditandai — jangan anggap ini selesai; laporkan.
                {report.reconciliation.actualInserted !== report.reconciliation.expectedInserted && (
                  <> {" "}Masuk: <strong>{report.reconciliation.actualInserted}</strong> dari{" "}
                  <strong>{report.reconciliation.expectedInserted}</strong> yang direncanakan.</>
                )}
                {report.reconciliation.actualTagged !== report.reconciliation.expectedTagged && (
                  <> {" "}Ditandai: <strong>{report.reconciliation.actualTagged}</strong> dari{" "}
                  <strong>{report.reconciliation.expectedTagged}</strong> yang direncanakan.</>
                )}
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Reported from what the WRITE did (committed.*), not from the plan: the plan is what we
                expected, these are what happened. */}
            <Stat label="Berhasil masuk" value={report.committed.inserted} tone="green" />
            <Stat label="Ditandai (sudah ada)" value={report.committed.taggedExisting} tone="blue" hint="Sudah ada di pool — hanya tag batch ini yang ditambahkan" />
            <Stat label="Kena suppression" value={report.plan.summary.suppressed} tone="amber" hint="Masuk, tapi takkan dikirimi" />
            <Stat label="Telepon bersama (kontak lain)" value={report.plan.summary.sharedPhone} tone="amber" hint="Masuk, teleponnya sama dengan kontak yang sudah ada" />
            <Stat label="Telepon ganda dalam berkas" value={report.committed.sharedPhoneInBatch} tone="amber" hint="Nomor dipakai lebih dari satu baris di berkas ini — telepon dikosongkan di semuanya" />
            {report.plan.summary.skippedMerged > 0 && (
              <Stat
                label="Dilewati — profil sudah digabung"
                value={report.plan.summary.skippedMerged}
                tone="amber"
                hint="Emailnya hanya cocok dengan profil yang sudah digabung — tidak diimpor dan tidak ditandai"
              />
            )}
            <Stat label="Dilewati / tak valid" value={report.plan.summary.duplicatesInBatch + report.plan.summary.invalid + report.plan.summary.sharedPhoneSuppressed} />
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

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: "green" | "amber" | "blue"; hint?: string }) {
  // Flat token classes only — a `<colour>-<number>` class emits no CSS at all here (README).
  const color =
    tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : tone === "blue" ? "text-blue" : "text-ink";
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
/**
 * Bagian 1: a mapped `tags` column previewed as FIELDS grouped per namespace — the owner's direct
 * complaint was the raw `event:…|format:…|…` block. Invalid tags (outside the vocabulary, or a system
 * marker a CSV must never inject) are shown apart, amber, never silently hidden. Indonesian only, to
 * match the rest of this wizard; the label vocabulary itself is bilingual + parity-guarded.
 */
function TagSample({ raw }: { raw: string }) {
  const { tags, invalid } = parseTagCell(raw);
  const grouped = groupTags(tags);
  if (grouped.operator.length === 0 && invalid.length === 0) {
    return <span className="text-ink-faint">{raw || "—"}</span>;
  }
  return (
    <div className="space-y-1">
      {grouped.operator.map(({ namespace, tags: vals }) => (
        <div key={namespace} className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">{namespaceLabel(namespace, "id")}:</span>
          {vals.map((tag) => (
            <span key={tag} className="rounded-sm bg-glass px-1.5 py-0.5 font-body text-[11px] text-ink">{tagValueLabel(tag, "id")}</span>
          ))}
        </div>
      ))}
      {invalid.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-wide text-amber">ditolak:</span>
          {invalid.map((t) => (
            <span key={t} className="rounded-sm bg-glass px-1.5 py-0.5 font-mono text-[11px] text-amber">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Preview of namespace-mapped column values → slugified tags in the mapping step. */
function NsTagPreview({ namespace, values }: { namespace: string; values: string[] }) {
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter((v) => v !== "")));
  if (unique.length === 0) return <span className="text-ink-faint">—</span>;
  return (
    <div className="space-y-0.5">
      {unique.slice(0, 3).map((v) => {
        const slug = slugifyTagValue(v);
        return (
          <div key={v} className="flex items-baseline gap-1.5">
            <span className="text-ink-faint">{v}</span>
            <span className="text-ink-faint">→</span>
            <span className="rounded-sm bg-glass px-1 py-0.5 font-mono text-[11px] text-ink">{namespace}:{slug || "?"}</span>
          </div>
        );
      })}
      {unique.length > 3 && <span className="text-[11px] text-ink-faint">…{unique.length - 3} lagi</span>}
    </div>
  );
}

/** Summary of tags generated from namespace-mapped columns, grouped by namespace. */
function NamespaceTagStats({ labels }: { labels: Record<string, string> }) {
  const byNs = new Map<string, { tag: string; label: string }[]>();
  for (const [tag, label] of Object.entries(labels)) {
    const ns = tag.slice(0, tag.indexOf(":"));
    const arr = byNs.get(ns) ?? [];
    arr.push({ tag, label });
    byNs.set(ns, arr);
  }
  return (
    <div className="mt-4 space-y-3">
      {Array.from(byNs.entries()).map(([ns, tags]) => (
        <div key={ns} className="rounded-card border border-glass-border bg-glass p-3">
          <div className="font-display text-[12px] font-bold text-ink">
            {tags.length} tag unik di namespace <span className="font-mono">{ns}:</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.slice(0, 10).map(({ tag, label }) => (
              <span key={tag} className="rounded-sm bg-glass px-2 py-0.5 font-body text-[11px] text-ink" title={label}>
                {tagValueLabel(tag, "id")}
              </span>
            ))}
            {tags.length > 10 && (
              <span className="px-1 py-0.5 font-body text-[11px] text-ink-faint">…{tags.length - 10} lagi</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function UnmappedColumns({ headers, mapping }: { headers: string[]; mapping: ColumnMapping }) {
  const ignored = headers.filter((h) => (mapping[h] ?? "ignore") === "ignore" && h.trim() !== "");
  if (ignored.length === 0) return null;
  return (
    <p className="mt-3 font-body text-[12px] text-ink-soft">
      Kolom tidak diimpor ({ignored.length}):{" "}
      <span className="text-ink">{ignored.join(", ")}</span>. Kembali ke pemetaan kalau salah satunya
      seharusnya dipetakan ke email, nama, atau tag namespace.
    </p>
  );
}

/** Per-row reasons. Lists every row that is NOT a plain insert — both SKIPS and flagged inserts
 *  (shared phone / suppressed) — each with its reason. The dedup match field is explicit (email vs
 *  phone) so the operator can tell an unambiguous email duplicate from a shared-number flag. It never
 *  shows WHO the row collided with — exposing another customer to the uploader is a separate,
 *  audited decision (K-57). Row number is +2: 1 for the header, 1 for 0-based index. */
function ProblemList({ outcomes }: { outcomes: RowOutcomeView[] }) {
  // Anything not a clean insert, PLUS any row that had a tag refused: a row can import perfectly and
  // still have lost a tag, and a dropped tag nobody is told about is the failure class this whole
  // sprint has been closing.
  const rows = outcomes.filter((o) => o.status !== "insert" || (o.invalidTags?.length ?? 0) > 0);
  if (rows.length === 0) return null;
  const LABEL: Record<string, string> = {
    skip_duplicate_email: "Sudah ada di pool → DITANDAI (tidak diimpor ulang)",
    skip_merged: "Profil sudah digabung → tidak diimpor, tidak ditandai",
    insert: "Masuk",
    skip_duplicate_in_batch: "Email dobel di file ini (dilewati)",
    skip_invalid: "Email tidak valid (dilewati)",
    skip_shared_phone_suppressed: "Telepon ter-suppress (dilewati — tak dibuat kontak baru)",
    insert_shared_phone: "Telepon cocok kontak lain (tetap masuk)",
    insert_suppressed: "Kena suppression (masuk, takkan dikirimi)",
  };
  return (
    <details className="mt-4">
      <summary className="cursor-pointer font-body text-[13px] text-ink-soft">
        Lihat baris yang dilewati, ditandai, atau punya tag ditolak ({rows.length})
      </summary>
      {rows.some((o) => (o.invalidTags?.length ?? 0) > 0) && (
        <p className="tint-amber mt-2 rounded-sm px-3 py-2 font-body text-[12px] leading-relaxed">
          Sebagian baris memuat tag di luar kosakata. Tag itu <strong>dibuang</strong>; barisnya tetap
          diproses dengan tag yang sah. Perbaiki berkasnya dan unggah ulang kalau tag itu seharusnya ikut.
        </p>
      )}
      <div className="mt-2 max-h-64 overflow-y-auto rounded-sm border border-glass-border">
        <table className="w-full border-collapse text-left">
          <tbody>
            {rows.slice(0, 500).map((p) => (
              <tr key={p.index} className="border-b border-glass-border/50">
                <td className="px-3 py-1.5 font-mono text-[12px] text-ink-faint">baris {p.index + 2}</td>
                <td className="px-3 py-1.5 font-body text-[12px] text-ink">{p.email ?? "—"}</td>
                <td className="px-3 py-1.5 font-body text-[12px] text-ink-soft">{LABEL[p.status] ?? p.status}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-amber">
                  {(p.invalidTags?.length ?? 0) > 0 ? `tag ditolak: ${p.invalidTags!.join(", ")}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
