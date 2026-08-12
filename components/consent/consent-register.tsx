"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert, Ban, Lock, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuppressionForm } from "@/components/consent/suppression-form";
import { LiftSuppressionDialog } from "@/components/consent/lift-dialog";

interface ConsentRow {
  id: string;
  customer_id: string | null;
  channel: string;
  purpose: string;
  basis: string;
  status: string;
  source: string | null;
  recorded_at: string | null;
  updated_at: string | null;
}
interface SuppressionRow {
  id: string;
  identity_kind: string;
  identity_key: string | null;
  reason_code: string;
  reason_detail: string | null;
  status: string;
  created_at: string | null;
}
interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
interface ApiResult {
  consent: Paged<ConsentRow>;
  suppression: Paged<SuppressionRow>;
}

/**
 * `basis` vocabulary — PROVISIONAL, not final (see docs/SIGNOFF-legal-consent.md).
 * Shown WITH its status so nobody reads two placeholder values as a complete list.
 */
const BASIS_VOCAB: { value: string; note: string }[] = [
  {
    value: "legacy_import_unverified",
    note: "impor lama; sejak keputusan pemilik produk (12 Agu 2026) mengizinkan marketing + transactional (docs/SIGNOFF-legal-consent.md)",
  },
  { value: "explicit_opt_in", note: "opt-in eksplisit tercatat — dasar terkuat, mengizinkan semua purpose" },
];

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

/** The meaning-of-zero banner — shown only WHILE the register is empty. */
function ZeroMeaning() {
  return (
    <div className="tint-red rounded-card p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          Nol baris consent = nol orang boleh dikirimi marketing
        </h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        Ini <strong>bukan</strong> “belum ada data”. Ini “<strong>tidak ada dasar hukum untuk
        siapa pun</strong>”. Ketiadaan baris consent adalah jawaban <strong>fail-closed</strong> yang
        benar: tanpa baris consent <span className="font-mono text-[12px]">purpose=marketing</span>{" "}
        <span className="font-mono text-[12px]">status=active</span>, seseorang tidak boleh
        dihubungi untuk marketing. Kartu “Bisa dihubungi” di dashboard menghitung dari aturan
        ini — hasilnya <strong>0 terukur</strong>, bukan 0 yang ditulis tangan.
      </p>
    </div>
  );
}

/** Shown once the register is populated — the backfill (Migrasi 11) recorded consent for the
 *  legacy import, and it is REVERSIBLE. Replaces the zero-meaning banner so the screen never
 *  contradicts its own data. */
function BackfilledMeaning() {
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          Consent legacy sudah dibackfill — basis <span className="font-mono">legacy_import_unverified</span>
        </h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        Migrasi 11 mencatat consent aktif untuk impor lama atas keputusan pemilik produk
        (12 Agu 2026): <strong>marketing</strong> + <strong>transactional</strong>, dengan basis{" "}
        <span className="font-mono text-[12px]">legacy_import_unverified</span> yang jujur menandai
        “belum diverifikasi per orang”. Suppression tetap <strong>menang</strong> atas consent (K-03).
        Ini <strong>reversibel</strong>: <span className="font-mono text-[12px]">crm_consent</span> nol
        trigger, dan menghapus baris <span className="font-mono text-[12px]">source =
        &apos;20fit_data_import&apos;</span> membatalkannya bersih.
      </p>
    </div>
  );
}

/** The rule hierarchy — the thing most likely to be misread. */
function SuppressionWins() {
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <Ban className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          Suppression MENANG atas consent
        </h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        Bila sebuah identitas kontak ada di <span className="font-mono text-[12px]">crm_suppression</span>{" "}
        (status <span className="font-mono text-[12px]">active</span>), ia <strong>tidak boleh
        dihubungi apa pun status consent-nya</strong> — walau punya opt-in aktif. Hierarki ini
        ditegakkan di <strong>kode</strong> (satu fungsi teruji, <span className="font-mono text-[12px]">isContactableForMarketing</span>),
        bukan di constraint database, jadi harus terbaca di sini. Suppression di-key pada identitas
        kontak (telepon/email ternormalisasi), bukan pada <span className="font-mono text-[12px]">customer_id</span>,
        supaya bertahan lintas penghapusan profil & impor ulang.
      </p>
    </div>
  );
}

function EmptyRegister({ what, why }: { what: string; why: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-glass-border px-6 py-12 text-center">
      <Badge tone="neutral">0 baris</Badge>
      <p className="max-w-lg font-body text-[13px] leading-relaxed text-ink-soft">
        <span className="font-semibold text-ink">{what} kosong.</span> {why}
      </p>
    </div>
  );
}

function Pager({
  page,
  total,
  pageSize,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const hasNext = page * pageSize < total;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[12px] text-ink-faint">
        {total === 0 ? "0 baris" : `Menampilkan ${first}–${last} dari ${total.toLocaleString("id-ID")}`}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={loading || page <= 1}
          className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
          Sebelumnya
        </button>
        <span className="font-mono text-[12px] text-ink-soft">Hal {page}</span>
        <button type="button" onClick={onNext} disabled={loading || !hasNext}
          className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
          Berikutnya
        </button>
      </div>
    </div>
  );
}

export function ConsentRegister() {
  const [cpage, setCpage] = useState(1);
  const [spage, setSpage] = useState(1);
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [liftTarget, setLiftTarget] = useState<{ id: string; label: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/consent?cpage=${cpage}&spage=${spage}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `Gagal memuat (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as ApiResult);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Gagal terhubung ke server.");
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [cpage, spage]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const consent = data?.consent;
  const suppression = data?.suppression;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Consent</h1>
        <p className="mt-2 font-body text-[14px] text-ink-soft">
          Register dasar hukum kontak &amp; daftar do-not-contact — baca saja. Fase 2 dibuka;
          jalur tulis ditunda ( <span className="font-mono text-[13px]">docs/RENCANA-jalur-tulis-consent.md</span> ).
        </p>
      </header>

      {consent && consent.total > 0 ? <BackfilledMeaning /> : <ZeroMeaning />}
      <SuppressionWins />

      {/* basis vocabulary + provisional status */}
      <div className="rounded-card border border-glass-border p-5">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          Kosakata <span className="font-mono">basis</span>{" "}
          <Badge tone="amber">sementara — menunggu daftar final legal</Badge>
        </h3>
        <ul className="mt-3 space-y-1.5 font-body text-[13px] text-ink-soft">
          {BASIS_VOCAB.map((b) => (
            <li key={b.value}>
              <span className="font-mono text-[12px] text-ink">{b.value}</span> — {b.note}
            </li>
          ))}
        </ul>
        <p className="mt-2 font-body text-[12px] text-ink-faint">
          Dua nilai ini bukan daftar lengkap. Status sign-off: docs/SIGNOFF-legal-consent.md.
        </p>
      </div>

      {error && (
        <div className="rounded-card border border-glass-border p-6 text-center">
          <Badge tone="red">Gagal</Badge>
          <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
        </div>
      )}

      {/* Consent register */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">Register consent</h2>
          <span className="font-mono text-[12px] text-ink-faint">crm_consent</span>
        </div>
        {loading && !data ? (
          <p className="font-body text-[14px] text-ink-soft">Memuat…</p>
        ) : consent && consent.total === 0 ? (
          <EmptyRegister
            what="Register consent"
            why="Belum ada satu baris pun. Backfill legacy (Migrasi 11) sudah disetujui pemilik produk tapi belum dijalankan di lingkungan ini; sampai dijalankan, nol tetap jawaban fail-closed yang benar. Basis yang akan dipakai: legacy_import_unverified (jujur menandai 'belum diverifikasi per orang')."
          />
        ) : consent ? (
          <>
            <div className="overflow-x-auto rounded-card border border-glass-border">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-bold">Profil</th>
                    <th className="px-4 py-3 font-bold">Channel</th>
                    <th className="px-4 py-3 font-bold">Purpose</th>
                    <th className="px-4 py-3 font-bold">Basis</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Dicatat</th>
                  </tr>
                </thead>
                <tbody className="font-body text-[13px] text-ink">
                  {consent.rows.map((r) => (
                    <tr key={r.id} className="border-b border-glass-border last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px]">{r.customer_id ?? <span className="text-ink-faint">(yatim)</span>}</td>
                      <td className="px-4 py-3">{r.channel}</td>
                      <td className="px-4 py-3">{r.purpose}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{r.basis}</td>
                      <td className="px-4 py-3"><Badge tone={r.status === "active" ? "green" : "neutral"}>{r.status}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{formatTs(r.recorded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={consent.page} total={consent.total} pageSize={consent.pageSize} loading={loading}
              onPrev={() => setCpage((p) => Math.max(1, p - 1))} onNext={() => setCpage((p) => p + 1)} />
          </>
        ) : null}
      </section>

      {/* Suppression list */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">Daftar suppression</h2>
          <span className="font-mono text-[12px] text-ink-faint">crm_suppression</span>
          {suppression && suppression.rows.some((r) => r.identity_key?.includes("*")) && (
            <Badge tone="amber" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> disamarkan</Badge>
          )}
          {/* Direct write entry — someone phoned in / messaged to stop. The page gate
              (consent.edit) already guards this whole screen; the API re-checks. */}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRecordOpen(true)}>
            <Ban className="h-3.5 w-3.5" /> Catat permintaan berhenti
          </Button>
        </div>
        {loading && !data ? (
          <p className="font-body text-[14px] text-ink-soft">Memuat…</p>
        ) : suppression && suppression.total === 0 ? (
          <EmptyRegister
            what="Daftar suppression"
            why="Belum ada satu baris pun. Nol suppression bukan berarti aman untuk mengontak — yang menahan kontak adalah ketiadaan consent (di atas), bukan ketiadaan suppression."
          />
        ) : suppression ? (
          <>
            <div className="overflow-x-auto rounded-card border border-glass-border">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-bold">Jenis</th>
                    <th className="px-4 py-3 font-bold">Identitas</th>
                    <th className="px-4 py-3 font-bold">Alasan</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Dicatat</th>
                    <th className="px-4 py-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="font-body text-[13px] text-ink">
                  {suppression.rows.map((r) => (
                    <tr key={r.id} className="border-b border-glass-border last:border-0">
                      <td className="px-4 py-3">{r.identity_kind}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{r.identity_key ?? "—"}</td>
                      <td className="px-4 py-3">{r.reason_code}</td>
                      <td className="px-4 py-3"><Badge tone={r.status === "active" ? "red" : "neutral"}>{r.status}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{formatTs(r.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {r.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setLiftTarget({
                                id: r.id,
                                label: `${r.identity_kind} · ${r.identity_key ?? "—"}`,
                              })
                            }
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Cabut
                          </Button>
                        ) : (
                          <span className="font-mono text-[11px] text-ink-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={suppression.page} total={suppression.total} pageSize={suppression.pageSize} loading={loading}
              onPrev={() => setSpage((p) => Math.max(1, p - 1))} onNext={() => setSpage((p) => p + 1)} />
          </>
        ) : null}
      </section>

      <p className="font-mono text-[11px] text-ink-faint">
        Suppression: catat &amp; cabut (atomik dengan audit, nol DELETE) · consent tetap baca-saja (menunggu kanal opt-in) ·
        dibaca via service role server-side · pembukaan halaman ini tercatat (list.viewed, crm_consent).
      </p>

      {/* Write path — direct entry (someone asked to stop) + per-row lift. */}
      <SuppressionForm mode="direct" open={recordOpen} onOpenChange={setRecordOpen} onRecorded={load} />
      {liftTarget && (
        <LiftSuppressionDialog
          open={liftTarget !== null}
          onOpenChange={(o) => !o && setLiftTarget(null)}
          suppressionId={liftTarget.id}
          identityLabel={liftTarget.label}
          onLifted={load}
        />
      )}
    </div>
  );
}
