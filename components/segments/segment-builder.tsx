"use client";

import { useState } from "react";
import Link from "next/link";
import { Filter, Clock, Users, Send, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ECOSYSTEM_UNITS, ECOSYSTEM_PRODUCTS_BY_UNIT } from "@/lib/crm/engagement-constants";
import { STAGING_RFM_VALUES, STAGING_PROGRAMS } from "@/lib/crm/staging-constants";
import { EMPTY_CRITERIA, type SegmentCriteria } from "@/lib/crm/segment";
import { FilterTreeBuilder, rowsToTree, type Row } from "@/components/segments/filter-tree-builder";

interface Counts {
  matched: number;
  contactableMarketing: number;
  contactableService: number;
}

const selectCls =
  "h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

const nf = new Intl.NumberFormat("id-ID");

/** Below this many matched profiles a segment practically points at individuals — a warning
 *  shows (the count is NOT suppressed; this builder never emits a list of people anyway). */
const SMALL_SEGMENT = 25;

/** The rule this whole screen exists to make visible (PRD §18.8). */
function TimeBanned() {
  return (
    <div className="tint-blue rounded-card p-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          Tidak ada kriteria berbasis waktu — dan itu disengaja
        </h3>
      </div>
      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
        Tidak ada “bergabung dalam N hari”, tidak ada recency. Semua kolom waktu di data ini
        (<span className="font-mono">created_at</span>, <span className="font-mono">first_seen_at</span>,{" "}
        <span className="font-mono">last_activity_at</span>) adalah <strong>cap waktu muat</strong> — satu instan
        per sumber, bukan jejak aktivitas (K-19, <span className="font-mono">docs/KOLOM-WAKTU.md</span>). Menyaring
        berdasarkan itu menghasilkan angka yang tampak tegas tapi tak bermakna. Kotaknya sengaja tidak ada supaya
        tak ada yang tergoda memakainya.
      </p>
    </div>
  );
}

export function SegmentBuilder({ cityFillPct, cityFilled, total, canViewHealth }: { cityFillPct: number; cityFilled: number; total: number; canViewHealth: boolean }) {
  const [c, setC] = useState<SegmentCriteria>(EMPTY_CRITERIA);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
    setCounts(null); // criteria changed -> stale result, recompute explicitly
  }

  function setRowsAndClear(r: Row[]) {
    setRows(r);
    setCounts(null); // filter changed -> stale result
  }

  async function compute() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Master fields come from the AND/OR tree; ecosystem + source presence stay
        // separate top-level ANDs (cross-table OR isn't expressible in one query).
        body: JSON.stringify({
          tree: rowsToTree(rows),
          ecoUnit: c.ecoUnit,
          ecoProduct: c.ecoProduct,
          srcHyrox: c.srcHyrox,
          srcMy20fit: c.srcMy20fit,
          srcRecency: c.srcRecency,
          srcArena: c.srcArena,
          srcGym: c.srcGym,
          srcClinicPatient: c.srcClinicPatient,
          srcClinicTxn: c.srcClinicTxn,
          srcRfm: c.srcRfm,
          srcProgram: c.srcProgram,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `Gagal menghitung (HTTP ${res.status}).`);
        setCounts(null);
        return;
      }
      setCounts({
        matched: data.matched,
        contactableMarketing: data.contactableMarketing,
        contactableService: data.contactableService,
      });
    } catch {
      setError("Gagal terhubung ke server.");
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Segments</h1>
          <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">
            Susun kriteria, lihat jumlahnya, ubah, lihat lagi. <strong>Tidak ada yang disimpan</strong> — tanpa
            tabel, tanpa nama segmen (penyimpanan ditunda; <span className="font-mono text-[13px]">docs/RENCANA-simpan-segmen.md</span>).
          </p>
        </div>
      </header>

      <TimeBanned />

      {/* Criteria */}
      <section className="glass rounded-card p-5">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-soft" aria-hidden />
          <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">Kriteria</h2>
        </div>

        <div className="mt-4">
          <FilterTreeBuilder rows={rows} setRows={setRowsAndClear} />
        </div>

        {/* Ecosystem presence (customer_engagement) — a DIFFERENT table + vocabulary from
            the attributes above. "Ada engagement di unit/produk ini", keyed by customer_id. */}
        <div className="mt-5 rounded-sm border border-glass-border/70 p-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-ink-soft" aria-hidden />
            <h3 className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">
              Ekosistem 20FIT
            </h3>
          </div>
          <p className="mt-1 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
            Menyaring profil yang punya <strong>minimal satu</strong> baris di{" "}
            <span className="font-mono">customer_engagement</span> pada unit / produk terpilih. Kosakata
            ini beda dari “Unit” di atas (ada <span className="font-mono">event</span> &amp;{" "}
            <span className="font-mono">membership</span>). Tetap <strong>tanpa kriteria waktu</strong>:{" "}
            <span className="font-mono">last_seen_at</span> 99,51% cap muat.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Unit ekosistem</span>
              <select className={selectCls} value={c.ecoUnit ?? ""} onChange={(e) => set("ecoUnit", e.target.value || null)}>
                <option value="">Semua unit ekosistem</option>
                {ECOSYSTEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Produk ekosistem</span>
              <select className={selectCls} value={c.ecoProduct ?? ""} onChange={(e) => set("ecoProduct", e.target.value || null)}>
                <option value="">Semua produk</option>
                {ECOSYSTEM_UNITS.map((u) => (
                  <optgroup key={u} label={u}>
                    {ECOSYSTEM_PRODUCTS_BY_UNIT[u].map((p) => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          {c.ecoUnit && c.ecoProduct && (
            <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-faint">
              Unit dan produk dipilih bersamaan: menyaring <strong>satu</strong> engagement yang cocok
              keduanya sekaligus. Karena tiap produk hanya milik satu unit, kombinasi lintas-unit berjumlah 0.
            </p>
          )}

          {/* Unmatched-source presence (Sprint 3R) — cocok lewat email ternormalisasi. */}
          <div className="mt-3 flex flex-col gap-2 border-t border-glass-border/60 pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcHyrox} onChange={(e) => set("srcHyrox", e.target.checked)} className="accent-red" />
              Peserta Hyrox (152 profil)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcMy20fit} onChange={(e) => set("srcMy20fit", e.target.checked)} className="accent-red" />
              Pengguna my20fit (169 profil)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcRecency} onChange={(e) => set("srcRecency", e.target.checked)} className="accent-red" />
              Punya aktivitas nyata (my20fit_user_activity — hanya 44 profil)
            </label>
            <p className="font-body text-[11px] leading-relaxed text-ink-faint">
              Cocok lewat email ternormalisasi (K-06). “Aktivitas nyata” adalah presensi, <strong>bukan</strong>
              {" "}kriteria waktu: <span className="font-mono">last_active_at</span> nyata tapi hanya untuk 44/82.253 —
              menjadikannya filter waktu akan terlihat presisi sambil menyembunyikan 99,9% pool (K-19).
            </p>
          </div>

          {/* Sumber lain (TUGAS 2) — arena/gym (email), klinik (telepon, digerbangi view_health). */}
          <div className="mt-3 flex flex-col gap-2 border-t border-glass-border/60 pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcArena} onChange={(e) => set("srcArena", e.target.checked)} className="accent-red" />
              Ada di arena (kelas / booking / paket / member)
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcGym} onChange={(e) => set("srcGym", e.target.checked)} className="accent-red" />
              Ada di gym (kelas / membership)
            </label>
            {canViewHealth ? (
              <>
                <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
                  <input type="checkbox" checked={c.srcClinicPatient} onChange={(e) => set("srcClinicPatient", e.target.checked)} className="accent-red" />
                  Pasien klinik <span className="font-mono text-[11px] text-ink-faint">(kesehatan · view_health)</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
                  <input type="checkbox" checked={c.srcClinicTxn} onChange={(e) => set("srcClinicTxn", e.target.checked)} className="accent-red" />
                  Punya transaksi klinik <span className="font-mono text-[11px] text-ink-faint">(kesehatan · view_health)</span>
                </label>
              </>
            ) : (
              <p className="font-body text-[11px] italic text-ink-faint">
                Kriteria klinik (pasien / transaksi) disembunyikan — butuh <span className="font-mono">profile.view_health</span>.
                Menyaring “pasien klinik” = menyimpulkan status kesehatan.
              </p>
            )}
            <p className="font-body text-[11px] leading-relaxed text-ink-faint">
              Arena/gym cocok lewat <strong>email</strong>; klinik lewat <strong>telepon</strong> dulu (K-06). Semua kondisi
              sumber di-<strong>AND</strong>-kan (irisan himpunan). <strong>OR lintas-tabel tidak tersedia</strong> — PostgREST
              tak bisa mengungkapkannya jujur dalam satu query, jadi tak disediakan pilihannya alih-alih diam-diam ber-AND.
            </p>
          </div>

          {/* Data impor 20FIT (staging_20fit_data, Sprint 3Y) — RFM + keikutsertaan program.
              Cocok lewat email (K-06), 98,6% pool. Program klinik (pasien klinik) digerbangi
              view_health seperti sumber klinis lain. */}
          <div className="mt-3 flex flex-col gap-3 border-t border-glass-border/60 pt-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">RFM (per paid order)</span>
                <select className={selectCls} value={c.srcRfm ?? ""} onChange={(e) => set("srcRfm", e.target.value || null)}>
                  <option value="">Semua RFM</option>
                  {STAGING_RFM_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                {c.srcRfm && (
                  <span className="font-body text-[11px] leading-relaxed text-amber">
                    RFM hampir tak bisa menyegmentasi: <span className="font-mono">New User</span> = 81.213 (92% pool),
                    dua keranjang teratas (<span className="font-mono">Loyal</span>+<span className="font-mono">Campion</span>) cuma 66 orang.
                    Menyaring “New User” ≈ menyaring semua orang; “Loyal” = 65 orang. Jangan susun kampanye di atasnya (T-19).
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Ikut program</span>
                <select className={selectCls} value={c.srcProgram ?? ""} onChange={(e) => set("srcProgram", e.target.value || null)}>
                  <option value="">Semua program</option>
                  <optgroup label="Program (non-klinis)">
                    {STAGING_PROGRAMS.filter((p) => !p.clinical).map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </optgroup>
                  {canViewHealth && (
                    <optgroup label="Klinik (kesehatan · view_health)">
                      {STAGING_PROGRAMS.filter((p) => p.clinical).map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            </div>
            <p className="font-body text-[11px] leading-relaxed text-ink-faint">
              Dari <span className="font-mono">staging_20fit_data</span> — impor yang sama dengan master, cocok{" "}
              <strong>98,6%</strong> lewat email (K-06). RFM ditampilkan apa adanya termasuk ejaan tersimpan{" "}
              (<span className="font-mono">Campion user</span>) — tidak “diperbaiki” agar tetap cocok dengan sumber. Program{" "}
              <strong>pasien klinik</strong> menyimpulkan status kesehatan, jadi {canViewHealth ? "digerbangi" : "disembunyikan —"}{" "}
              <span className="font-mono">profile.view_health</span>. Di-<strong>AND</strong>-kan dengan kriteria lain.
            </p>
          </div>
        </div>

        {/* City warning — in place, not a footnote (93% empty). */}
        <div className="tint-amber mt-4 rounded-sm px-3 py-2">
          <p className="font-body text-[12px] leading-relaxed text-ink">
            <strong>Kota hanya terisi {cityFillPct.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</strong>{" "}
            ({nf.format(cityFilled)} dari {nf.format(total)}). Menyaring kota atas data yang ±93% kosong hanya menyaring
            “orang yang kotanya kebetulan tercatat” — hasilnya tampak tegas tapi menyesatkan.
          </p>
        </div>

        <div className="mt-4">
          <Button onClick={compute} disabled={loading}>
            {loading ? "Menghitung…" : "Hitung"}
          </Button>
          {error && <p className="mt-2 font-body text-[13px] text-red">{error}</p>}
        </div>
      </section>

      {/* Paired counts — audiens NEVER shown without contactable (PRD §18.8). Marketing and
          service (layanan) are DISTINCT permissions and shown separately (Migrasi 11):
          collapsing them hides the very distinction CS relies on. */}
      {counts && counts.matched > 0 && counts.matched < SMALL_SEGMENT && (
        <div className="tint-amber rounded-card px-4 py-3">
          <p className="font-body text-[12px] leading-relaxed text-ink">
            <strong>Segmen sangat kecil ({nf.format(counts.matched)} profil).</strong> Di bawah {SMALL_SEGMENT} orang, sebuah
            segmen praktis menunjuk individu tertentu — sifatnya berubah dari agregat jadi pengungkapan. Angka tetap
            ditampilkan (0 disembunyikan justru menyembunyikan yang terukur), tapi jangan diperlakukan sebagai agregat
            anonim. Builder ini tak pernah mengeluarkan daftar orang (itu tugas /audience, tersamar &amp; teraudit).
          </p>
        </div>
      )}
      {counts && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass rounded-card p-5">
            <div className="flex items-center gap-2 text-ink-soft">
              <Users className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">Cocok kriteria</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{nf.format(counts.matched)}</p>
            <p className="mt-1 font-body text-[12px] text-ink-faint">orang memenuhi definisi ini</p>
          </div>

          <div className={`${counts.contactableMarketing === 0 ? "tint-red" : "glass"} rounded-card p-5`}>
            <div className="flex items-center gap-2 text-ink-soft">
              <Send className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">Boleh dihubungi · marketing</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{nf.format(counts.contactableMarketing)}</p>
            {counts.contactableMarketing === 0 ? (
              <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                <strong>Nol dari {nf.format(counts.matched)}.</strong> Tak ada consent{" "}
                <span className="font-mono">marketing</span> aktif (atau suppression menang, K-03).{" "}
                <Link href="/consent" className="font-semibold text-ink underline underline-offset-2">Buka Consent</Link>.
              </p>
            ) : (
              <p className="mt-1 font-body text-[12px] text-ink-faint">consent marketing aktif &amp; tidak disuppress</p>
            )}
          </div>

          <div className={`${counts.contactableService === 0 ? "tint-red" : "glass"} rounded-card p-5`}>
            <div className="flex items-center gap-2 text-ink-soft">
              <Send className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">Boleh dihubungi · layanan</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{nf.format(counts.contactableService)}</p>
            {counts.contactableService === 0 ? (
              <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                <strong>Nol dari {nf.format(counts.matched)}.</strong> Tak ada consent{" "}
                <span className="font-mono">transactional</span> aktif (atau suppression menang, K-03).
              </p>
            ) : (
              <p className="mt-1 font-body text-[12px] text-ink-faint">
                consent layanan (transactional) aktif &amp; tidak disuppress — untuk CS/operasional
              </p>
            )}
          </div>
        </section>
      )}

      <p className="font-mono text-[11px] text-ink-faint">
        Baca saja · nol simpan/ekspor/kirim (belum ada; tombol yang menolak lebih buruk dari tak ada tombol) · nol daftar orang
        (segment builder yang mengeluarkan daftar = ekspor tanpa nama — pakai /audience) · tiap perhitungan tercatat (list.viewed).
      </p>
    </div>
  );
}
