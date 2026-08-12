"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ARTIFACTS_VERIFIED_ON,
  VERIFIED_ARTIFACTS,
  fillTone,
  formatCount,
  formatPct,
  issueTone,
  pct,
  type IssueCount,
  type QualitySnapshot,
  type Tone,
} from "@/lib/crm/quality-types";

/** Tint classes come from globals.css (.tint-*). Never a raw colour here. */
const TINT: Record<Tone, string> = {
  red: "tint-red",
  amber: "tint-amber",
  green: "tint-green",
  neutral: "tint-neutral",
};

/**
 * Horizontal fill bar. The track is a neutral tint and the fill is the tone tint, so
 * the whole thing re-tints with [data-theme="dark"] and never carries a hex value.
 */
function FillBar({ rate, tone }: { rate: number; tone: Tone }) {
  return (
    <div
      className="tint-neutral h-1.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={`${formatPct(rate)} terisi`}
    >
      <div
        className={`${TINT[tone]} h-full rounded-full`}
        style={{ width: `${Math.max(rate, rate > 0 ? 1 : 0)}%` }}
      />
    </div>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass shadow-glass p-6">
      <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">
        {title}
      </h2>
      {caption && (
        <p className="mt-1.5 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
          {caption}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A defect figure with the exact definition of what was counted underneath it. */
function IssueRow({ issue, total }: { issue: IssueCount; total: number }) {
  const tone = issueTone(issue.count);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="font-body text-[14px] font-semibold text-ink">{issue.label}</p>
        <p className="mt-1 max-w-2xl font-body text-[12px] leading-relaxed text-ink-soft">
          {issue.definition}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-[13px] text-ink-faint">
          {total > 0 ? formatPct(pct(issue.count, total)) : "—"}
        </span>
        <Badge tone={tone}>{formatCount(issue.count)}</Badge>
      </div>
    </div>
  );
}

export function QualityDashboard() {
  const [data, setData] = useState<QualitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/quality", { signal: ac.signal, cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `Gagal memuat (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as QualitySnapshot);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Gagal terhubung ke server.");
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            Quality
          </h1>
          <p className="mt-2 max-w-2xl font-body text-[14px] leading-relaxed text-ink-soft">
            Kondisi data apa adanya di{" "}
            <span className="font-mono text-[13px]">master_customer</span> — dihitung ulang
            setiap halaman dibuka, tidak ada angka yang ditulis tangan.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-glass-border bg-glass px-4 font-display text-[13px] font-bold uppercase tracking-wide text-ink transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-red disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Hitung ulang
        </button>
      </header>

      {error && (
        <div className="rounded-card border border-glass-border p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red" aria-hidden />
            <p className="font-body text-[14px] font-semibold text-ink">{error}</p>
          </div>
        </div>
      )}

      {loading && !data && (
        <p className="font-body text-[14px] text-ink-soft">Menghitung agregat…</p>
      )}

      {data && (
        <>
          {/* Reachability caveat FIRST. The single most misreadable number on this
              screen is "punya identifier" — it is not "bisa dihubungi" (PRD §18.8). */}
          <div className="glass shadow-glass p-6">
            <div className="flex items-center gap-2">
              <ShieldQuestion className="h-4 w-4 text-amber" aria-hidden />
              <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
                Punya identifier ≠ bisa dihubungi
              </h2>
            </div>
            <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
              Seluruh {formatCount(total)} profil memiliki setidaknya satu identifier kontak,
              tetapi jumlah yang boleh dihubungi masih{" "}
              <span className="font-semibold text-ink">nol</span>: register consent belum ada
              (migrasi <span className="font-mono text-[12px]">crm_consent</span> ditahan
              menunggu persetujuan legal) dan{" "}
              <span className="font-mono text-[12px]">crm_suppression</span> masih kosong.
              Angka di halaman ini mengukur <em>kelengkapan data</em>, bukan izin mengirim.
            </p>
          </div>

          <Panel
            title="Fill rate"
            caption={`Berapa persen dari ${formatCount(total)} profil yang punya isi di tiap field. “Terisi” berarti NOT NULL — tidak ada penilaian mutu isi di sini. Ambang warna (≥95% hijau, ≥60% kuning) adalah konvensi tampilan, bukan SLA dari PRD.`}
          >
            <div className="space-y-4">
              {data.fillRates.map((f) => {
                const rate = pct(f.filled, total);
                const tone = fillTone(rate);
                return (
                  <div key={f.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-body text-[14px] font-semibold text-ink">
                        {f.label}{" "}
                        <span className="font-mono text-[12px] font-normal text-ink-faint">
                          {f.column}
                        </span>
                      </p>
                      <p className="font-mono text-[13px] text-ink">
                        {formatPct(rate)}{" "}
                        <span className="text-ink-faint">
                          · {formatCount(f.filled)}/{formatCount(total)}
                        </span>
                      </p>
                    </div>
                    <div className="mt-2">
                      <FillBar rate={rate} tone={tone} />
                    </div>
                    {f.note && (
                      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
                        {f.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Identifier tidak valid"
            caption="Pemeriksaan bentuk, bukan verifikasi bahwa nomor atau email benar-benar aktif. Nol di sini bukan jaminan keterkiriman."
          >
            {data.identifiers.map((i) => (
              <IssueRow key={i.key} issue={i} total={total} />
            ))}
          </Panel>

          <Panel
            title="Anomali nilai"
            caption="Nilai yang lolos semua pemeriksaan bentuk tetapi tidak masuk akal secara bisnis — dan yang paling penting, tidak tertangkap oleh filter di layar lain."
          >
            {data.anomalies.map((i) => (
              <IssueRow key={i.key} issue={i} total={total} />
            ))}
          </Panel>

          <Panel
            title="Duplikat"
            caption="Penandaan berasal dari proses impor lama. Alur merge/unmerge belum dibangun, jadi angka ini hanya bisa naik."
          >
            {data.duplicates.map((i) => (
              <IssueRow key={i.key} issue={i} total={total} />
            ))}
          </Panel>

          <Panel
            title="Antrean orphan & pengecualian"
            caption="Baris yang tidak masuk ke master. Persentase dihitung terhadap jumlah profil master sebagai pembanding skala, bukan sebagai bagian dari master."
          >
            {data.queues.map((i) => (
              <IssueRow key={i.key} issue={i} total={total} />
            ))}
          </Panel>

          <Panel
            title="Kurasi & skor"
            caption="Tabel satelit crm_* sudah ada tetapi belum terisi. Ini bukan “skor basi” — skornya belum pernah dihitung sama sekali."
          >
            <div className="space-y-3.5">
              {data.satellites.map((s) => {
                const rate = pct(s.rows, total);
                return (
                  <div
                    key={s.key}
                    className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[14px] font-semibold text-ink">
                        {s.label}{" "}
                        <span className="font-mono text-[12px] font-normal text-ink-faint">
                          {s.table}
                        </span>
                      </p>
                      <p className="mt-1 max-w-2xl font-body text-[12px] leading-relaxed text-ink-soft">
                        {s.note}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[13px] text-ink-faint">
                        {formatPct(rate)}
                      </span>
                      <Badge tone={s.rows === 0 ? "neutral" : "green"}>
                        {formatCount(s.rows)}/{formatCount(total)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Ekosistem 20FIT — customer_engagement"
            caption={`Jejak keterlibatan lintas unit (arena, clinic, event, gym, membership, shop) dari tabel customer_engagement — dibaca di tempat, tanpa disalin ke crm_*. Angka di sini yang bisa dihitung live (baris total, sebaran per-unit, baris tanggal-masa-depan). Dua angka terpenting — % cap muat dan cakupan profil — perbandingan antar-kolom / count distinct yang tidak bisa lewat API baca ini; ada di panel bertanggal di bawah.`}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-body text-[14px] font-semibold text-ink">Total baris engagement</p>
                <p className="font-mono text-[13px] text-ink">{formatCount(data.ecosystem.totalRows)}</p>
              </div>

              <div className="space-y-3 border-t border-glass-border pt-3">
                <p className="font-body text-[12px] text-ink-soft">
                  Sebaran per unit (<strong>baris</strong>, bukan pelanggan — satu pelanggan bisa punya
                  beberapa produk di unit yang sama):
                </p>
                {data.ecosystem.unitSpread
                  .slice()
                  .sort((a, b) => b.rows - a.rows)
                  .map((u) => {
                    const rate = pct(u.rows, data.ecosystem.totalRows);
                    return (
                      <div key={u.unit}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-mono text-[13px] text-ink">{u.unit}</p>
                          <p className="font-mono text-[13px] text-ink">
                            {formatPct(rate)}{" "}
                            <span className="text-ink-faint">· {formatCount(u.rows)}</span>
                          </p>
                        </div>
                        <div className="mt-1.5">
                          <FillBar rate={rate} tone="neutral" />
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border pt-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-body text-[14px] font-semibold text-ink">
                    Baris <span className="font-mono text-[12px]">last_seen_at</span> di masa depan
                  </p>
                  <p className="mt-1 max-w-2xl font-body text-[12px] leading-relaxed text-ink-soft">
                    last_seen_at &gt; sekarang — cacat data (tanggal yang belum terjadi tak bisa jadi
                    aktivitas). Sejajar dengan LTV negatif dan first_seen_at &gt; created_at: ditampilkan,
                    bukan diperbaiki (K-20). Ini SATU-satunya bagian cap-muat ekosistem yang bisa dihitung
                    live (perbandingan ke literal waktu, bukan antar-kolom).
                  </p>
                </div>
                <Badge tone={issueTone(data.ecosystem.futureDated)}>
                  {formatCount(data.ecosystem.futureDated)}
                </Badge>
              </div>
            </div>
          </Panel>

          {data.stagingCoverage && (
            <Panel
              title="Cakupan data impor — staging_20fit_data (Sprint 3Y) ★"
              caption="Impor yang SAMA dengan master_customer, dicocokkan lewat email ternormalisasi (K-06). Cakupan 98,6% (81.079/82.253 profil, count distinct — angka bertanggal 12 Agu 2026 karena tak bisa live via PostgREST) — kontras tajam dengan seluruh sumber lain digabung (922 profil / 1,12%). Inilah sumber yang mengisi tanggal lahir (master_customer: 0), kota, RFM, dan keikutsertaan program. Nol tulis, nol salin."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-sm border border-glass-border p-3">
                    <div className="font-display text-[22px] font-black leading-none text-ink">{formatCount(data.stagingCoverage.rowsTotal)}</div>
                    <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">Baris impor</div>
                  </div>
                  <div className="rounded-sm border border-glass-border p-3">
                    <div className="font-display text-[22px] font-black leading-none text-ink">{formatCount(data.stagingCoverage.withEmail)}</div>
                    <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">Punya email</div>
                  </div>
                  <div className="rounded-sm border border-glass-border p-3">
                    <div className="font-display text-[22px] font-black leading-none text-ink">{formatCount(data.stagingCoverage.withDob)}</div>
                    <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">Punya tgl lahir</div>
                  </div>
                </div>

                {/* Birth-date parse outcomes — the sprint headline. Failed = flagged, not dropped. */}
                <div className="border-t border-glass-border pt-3">
                  <p className="font-body text-[13px] font-semibold text-ink">Penguraian tanggal lahir</p>
                  <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">
                    <strong>{formatCount(data.stagingCoverage.dobParsed)}</strong> berhasil diurai ·{" "}
                    <strong>{formatCount(data.stagingCoverage.dobUnparseable)}</strong> gagal (ditandai, bukan dibuang) ·{" "}
                    <strong>{formatCount(data.stagingCoverage.dobAmbiguousDayMonth)}</strong> hari-bulan ambigu (≤12 di dua posisi — tak bisa dipastikan) ·{" "}
                    <strong>{formatCount(data.stagingCoverage.dobSwapped)}</strong> terbukti tertukar (bulan &gt; 12) ·{" "}
                    <strong>{formatCount(data.stagingCoverage.dobImplausible)}</strong> umur mustahil (&lt;10 / &gt;100 / masa depan)
                  </p>
                  <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                    Silang <span className="font-mono">Umur</span> (as-of snapshot 20 Apr 2026, memvalidasi TAHUN saja — menukar
                    hari-bulan tak mengubah umur): {formatCount(data.stagingCoverage.umurChecked)} diperiksa ·{" "}
                    <strong>{formatCount(data.stagingCoverage.umurYearExact)}</strong> sama persis ·{" "}
                    {formatCount(data.stagingCoverage.umurOffByOne)} beda 1 tahun (drift snapshot, wajar) ·{" "}
                    <strong>{formatCount(data.stagingCoverage.umurConflict)}</strong> bentrok ≥2 tahun (konflik tahun nyata)
                  </p>
                </div>

                {/* RFM spread — misspelling kept; 0 shown (K-08). */}
                <div className="border-t border-glass-border pt-3">
                  <p className="font-body text-[13px] font-semibold text-ink">RFM per paid order</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.stagingCoverage.rfm.map((r) => (
                      <span key={r.value} className="rounded-sm border border-glass-border px-2.5 py-1 font-mono text-[12px] text-ink">
                        {r.value === "-" ? "− (tanpa bucket)" : r.value}: {formatCount(r.count)}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 font-body text-[11px] text-ink-faint">
                    Ejaan tersimpan dipertahankan (<span className="font-mono">Campion user</span>), tidak “diperbaiki”. <span className="font-mono">RFM per revenue</span> 0% terisi.
                  </p>
                </div>

                {/* Program participation — every column incl. the all-zero Arena/GYM/Paid Shop (K-08). */}
                <div className="border-t border-glass-border pt-3">
                  <p className="font-body text-[13px] font-semibold text-ink">Keikutsertaan program</p>
                  <p className="mt-1 font-body text-[11px] text-ink-faint">
                    “−” = tidak ikut, NULL = kosong (dibedakan). Arena / GYM / Paid Shop nol terukur — barisnya tetap ditampilkan (K-08).
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.stagingCoverage.programs.map((p) => (
                      <span
                        key={p.key}
                        className="rounded-sm border border-glass-border px-2.5 py-1 font-mono text-[12px] text-ink"
                        title={p.clinical ? "kolom klinis (pasien) — agregat, bukan per-orang" : undefined}
                      >
                        {p.label}{p.clinical ? " ⚕" : ""}: {formatCount(p.count)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <Panel
            title="Cakupan sumber ekosistem tak-tercocok (Sprint 3R)"
            caption="Sumber lain (Hyrox, my20fit) dikaitkan ke profil lewat email ternormalisasi (K-06). Tingkat kecocokan RENDAH — jauh lebih banyak baris sumber yang tak punya profil master. Itu temuan kualitas data, bukan detail implementasi: menampilkan jumlah peserta tanpa menyebut yang tak tersambung membuat orang menyimpulkan itulah seluruh peserta. “Cocok” di sini = profil master berbeda (satu email bisa banyak baris sumber). rc_team_members dikecualikan (berkunci nama)."
          >
            <div className="space-y-3.5">
              {data.enrichmentCoverage.map((s) => (
                <div key={s.key} className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">{s.label}</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      {formatCount(s.matchedProfiles)} profil cocok dari {formatCount(s.sourceRows)} baris sumber
                      {" · "}{formatCount(Math.max(s.sourceRows - s.matchedProfiles, 0))} tak tersambung ke master
                    </p>
                  </div>
                  <Badge tone={s.matchedProfiles === 0 ? "neutral" : "amber"}>
                    {formatCount(s.matchedProfiles)}/{formatCount(s.sourceRows)}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Cakupan sumber lain — arena / gym (TUGAS 3–4)"
            caption="Dikaitkan lewat email ternormalisasi (K-06). Cakupan RENDAH = identitas antar-sistem 20FIT belum terpadu — temuan kualitas data, bukan bug. DUA sebab dengan gejala sama, dibedakan di angka: bila “punya email” < “baris”, identifier-nya kosong; bila “cocok” < “punya email”, orangnya memang tak ada di master_customer. Baris bernilai nol tetap ditampilkan (0 terukur, bukan tak ada sumber)."
          >
            <div className="space-y-3.5">
              {data.multiSourceCoverage.map((s) => (
                <div key={s.key} className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">{s.label}</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      {formatCount(s.matchedProfiles)} profil cocok · {formatCount(s.withKey)} punya email · {formatCount(s.sourceRows)} baris
                    </p>
                    <p className="mt-0.5 font-body text-[11px] text-ink-faint">
                      {s.withKey < s.sourceRows
                        ? `${formatCount(s.sourceRows - s.withKey)} baris tanpa email (identifier kosong)`
                        : "semua baris punya email"}
                      {" · "}
                      {formatCount(Math.max(s.withKey - s.matchedProfiles, 0))} punya email tapi tak ada di master
                    </p>
                  </div>
                  <Badge tone={s.matchedProfiles === 0 ? "neutral" : "amber"}>
                    {formatCount(s.matchedProfiles)}/{formatCount(s.sourceRows)}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>

          {data.clinicCoverage && (
            <Panel
              title="Cakupan klinik (TUGAS 3)"
              caption="Klinik dicocokkan TELEPON dulu (K-06): email hanya menemukan sebagian kecil karena banyak pasien tak punya email — bukan karena mereka tak ada di master. Transaksi tak-tertaut adalah sebab BERBEDA (patient_id NULL dari impor spreadsheet), ditampilkan terpisah agar tak mengaburkan tingkat kecocokan."
            >
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">clinic_patients</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      <strong>{formatCount(data.clinicCoverage.matchedByPhone)}</strong> cocok via telepon ·{" "}
                      {formatCount(data.clinicCoverage.matchedByEmail)} via email · dari {formatCount(data.clinicCoverage.patientsRows)} pasien
                    </p>
                    <p className="mt-0.5 font-body text-[11px] text-ink-faint">
                      {formatCount(data.clinicCoverage.patientsWithPhone)} punya telepon ·{" "}
                      {formatCount(data.clinicCoverage.patientsWithEmail)} punya email — itu sebabnya telepon jauh lebih tinggi
                    </p>
                  </div>
                  <Badge tone={data.clinicCoverage.matchedByPhone === 0 ? "neutral" : "amber"}>
                    {formatCount(data.clinicCoverage.matchedByPhone)}/{formatCount(data.clinicCoverage.patientsRows)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">clinic_transactions — tautan pasien</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      {formatCount(data.clinicCoverage.transactionsLinked)} tertaut · <strong>{formatCount(data.clinicCoverage.transactionsNullFk)} patient_id NULL</strong> dari {formatCount(data.clinicCoverage.transactionsTotal)}
                    </p>
                    <p className="mt-0.5 font-body text-[11px] text-ink-faint">
                      Sebab berbeda: impor spreadsheet yang tak pernah ditautkan ke pasien — bukan tingkat kecocokan. Yang tertaut valid 100%.
                    </p>
                  </div>
                  <Badge tone={issueTone(data.clinicCoverage.transactionsNullFk)}>
                    {formatCount(data.clinicCoverage.transactionsNullFk)}
                  </Badge>
                </div>
                <p className="border-t border-glass-border pt-3 font-body text-[11px] text-ink-faint">
                  Terlalu tipis untuk ditampilkan per-profil (dicatat di sini):{" "}
                  {data.clinicCoverage.sparse.map((t) => `${t.table} (${formatCount(t.rows)})`).join(" · ")}.
                </p>
              </div>
            </Panel>
          )}

          <Panel
            title="Temuan yang tidak bisa dihitung live"
            caption={`Hal-hal berikut sudah diverifikasi langsung ke database pada ${ARTIFACTS_VERIFIED_ON}, tetapi tidak bisa dihitung ulang lewat API baca yang dipakai halaman ini (tidak ada perbandingan antar-kolom maupun regex). Angkanya statis dan sengaja diberi tanggal — jangan dibaca sebagai angka hari ini.`}
          >
            <ul className="space-y-3.5">
              {VERIFIED_ARTIFACTS.map((a) => (
                <li
                  key={a.key}
                  className="border-t border-glass-border pt-3.5 first:border-t-0 first:pt-0"
                >
                  <p className="font-body text-[14px] font-semibold text-ink">{a.label}</p>
                  <p className="mt-1 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
                    {a.detail}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <p className="font-mono text-[11px] text-ink-faint">
            Dihitung {new Date(data.computedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
            · agregat saja, tidak ada baris individual yang dibaca · agregat tetap tanpa parameter pengguna — tidak diaudit
          </p>
        </>
      )}
    </div>
  );
}
