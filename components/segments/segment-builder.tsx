"use client";

import { useState } from "react";
import Link from "next/link";
import { Filter, Clock, MapPin, Users, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AUDIENCE_UNITS,
  AUDIENCE_SEGMENTS,
  SEGMENT_NULL,
} from "@/lib/crm/audience-constants";
import { EMPTY_CRITERIA, type SegmentCriteria, type RevenueCriterion } from "@/lib/crm/segment";

interface Counts {
  matched: number;
  contactable: number;
}

const selectCls =
  "h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

const nf = new Intl.NumberFormat("id-ID");

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

export function SegmentBuilder({ cityFillPct, cityFilled, total }: { cityFillPct: number; cityFilled: number; total: number }) {
  const [c, setC] = useState<SegmentCriteria>(EMPTY_CRITERIA);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
    setCounts(null); // criteria changed -> stale result, recompute explicitly
  }

  async function compute() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `Gagal menghitung (HTTP ${res.status}).`);
        setCounts(null);
        return;
      }
      setCounts({ matched: data.matched, contactable: data.contactable });
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

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Unit</span>
            <select className={selectCls} value={c.unit ?? ""} onChange={(e) => set("unit", e.target.value || null)}>
              <option value="">Semua unit</option>
              {AUDIENCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Segment</span>
            <select className={selectCls} value={c.segment ?? ""} onChange={(e) => set("segment", e.target.value || null)}>
              <option value="">Semua segment</option>
              {AUDIENCE_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value={SEGMENT_NULL}>(tanpa segment — kohort NULL)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Revenue</span>
            <select
              className={selectCls}
              value={c.revenue}
              onChange={(e) => set("revenue", e.target.value as RevenueCriterion)}
            >
              <option value="all">Semua</option>
              <option value="has">Punya (&gt; 0)</option>
              <option value="none">Tanpa (0 / kosong)</option>
              <option value="negative">Negatif (1 baris anomali — T-10)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
            <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              <MapPin className="h-3 w-3" /> Kota
            </span>
            <input
              className={`${selectCls} placeholder:text-ink-faint`}
              value={c.city ?? ""}
              onChange={(e) => set("city", e.target.value || null)}
              placeholder="mis. Jakarta"
            />
          </label>

          <div className="flex flex-col justify-end gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.hasPhone} onChange={(e) => set("hasPhone", e.target.checked)} className="accent-red" />
              Punya telepon
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.hasEmail} onChange={(e) => set("hasEmail", e.target.checked)} className="accent-red" />
              Punya email
            </label>
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

      {/* Paired counts — audiens NEVER shown without contactable (PRD §18.8) */}
      {counts && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass rounded-card p-5">
            <div className="flex items-center gap-2 text-ink-soft">
              <Users className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">Cocok kriteria</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{nf.format(counts.matched)}</p>
            <p className="mt-1 font-body text-[12px] text-ink-faint">orang memenuhi definisi ini</p>
          </div>

          <div className={`${counts.contactable === 0 ? "tint-red" : "glass"} rounded-card p-5`}>
            <div className="flex items-center gap-2 text-ink-soft">
              <Send className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">Boleh dihubungi</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{nf.format(counts.contactable)}</p>
            {counts.contactable === 0 ? (
              <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                <strong>Nol dari {nf.format(counts.matched)}.</strong> Bukan bug — <span className="font-mono">crm_consent</span>{" "}
                kosong, jadi tak seorang pun punya izin marketing aktif, dan suppression menang atas consent (K-03).
                Segmen sebesar apa pun berjumlah <strong>0 yang boleh dikirimi pesan</strong> sampai ada consent tercatat.{" "}
                <Link href="/consent" className="font-semibold text-ink underline underline-offset-2">Buka Consent</Link>.
              </p>
            ) : (
              <p className="mt-1 font-body text-[12px] text-ink-faint">punya consent marketing aktif &amp; tidak disuppress</p>
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
