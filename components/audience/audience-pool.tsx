"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SEGMENT_NULL,
  AUDIENCE_UNITS,
  AUDIENCE_SEGMENTS,
  AUDIENCE_DEFAULT_PAGE_SIZE,
} from "@/lib/crm/audience-constants";

// Row shape mirrors lib/crm/audience.ts AudienceRow (phone/email already masked
// server-side when `masked`). We never receive customer_id — not a display column.
interface Row {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  created_at: string | null;
}

interface ApiResult {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  masked: boolean;
}

type RevenueFilter = "all" | "has" | "none";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

/** Explicitly-empty cell. Empty data is SHOWN, never hidden (Sprint 3A honesty rule). */
function Empty() {
  return <span className="font-body text-[13px] italic text-ink-faint">belum terisi</span>;
}

/**
 * The honest data-quality banner. These are the problems the team needs to SEE.
 *
 * It used to carry the figures inline (0%, 7,03%, 98,65%, 1.112 profil…). Those are
 * gone ON PURPOSE: hardcoded numbers in a component are a snapshot of one afternoon
 * that keeps rendering with total confidence long after the data has moved. The
 * numbers now live on /quality, which recomputes them per request. This banner keeps
 * only the qualitative warnings — statements that stay true regardless of the count —
 * and points at the screen that owns the arithmetic.
 *
 * Styling note: the tint comes from `.tint-amber` in globals.css. The earlier
 * `amber-500` utilities silently produced NOTHING — tailwind.config.ts maps `amber`
 * to a bare `var(--amber)`, which removes the numeric scale and blocks opacity
 * modifiers, so this callout rendered untinted and the icon rendered uncoloured.
 */
function QualityBanner() {
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          Data apa adanya dari sistem lama — belum diremediasi
        </h2>
      </div>
      <ul className="mt-3 space-y-1.5 font-body text-[13px] leading-relaxed text-ink-soft">
        <li>
          <span className="font-semibold text-ink">Gender, tanggal lahir, dan alamat kosong</span>{" "}
          untuk seluruh pool — ditampilkan sebagai “belum terisi”, tidak disembunyikan.
        </li>
        <li>
          <span className="font-semibold text-ink">Kota hanya terisi sebagian kecil.</span>{" "}
          Penargetan per kota belum bisa dipertanggungjawabkan.
        </li>
        <li>
          <span className="font-semibold text-ink">Hampir semua lifetime value bernilai nol.</span>{" "}
          “Rp 0” ditampilkan apa adanya, bukan disamarkan sebagai data hilang.
        </li>
        <li>
          <span className="font-semibold text-ink">Segment terbalik.</span> Kohort tanpa segment
          (NULL) justru memiliki rata-rata LTV tertinggi — ditampilkan apa adanya, tidak dirapikan.
        </li>
        <li>
          <span className="font-semibold text-ink">“Terakhir aktif” sengaja tidak ditampilkan.</span>{" "}
          Kolom <span className="font-mono text-[12px]">last_activity_at</span> adalah artefak impor,
          bukan jejak aktivitas.
        </li>
      </ul>
      <p className="mt-3 font-body text-[13px] text-ink-soft">
        Angka pastinya dihitung langsung dari database di{" "}
        <Link href="/quality" className="font-semibold text-ink underline underline-offset-2">
          Quality
        </Link>
        .
      </p>
    </div>
  );
}

const selectCls =
  "h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

export function AudiencePool() {
  const [unit, setUnit] = useState("");
  const [segment, setSegment] = useState("");
  const [revenue, setRevenue] = useState<RevenueFilter>("all");
  const [cityInput, setCityInput] = useState("");
  const [city, setCity] = useState(""); // debounced
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the free-text city filter; reset to page 1 when it changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setCity(cityInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [cityInput]);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(AUDIENCE_DEFAULT_PAGE_SIZE));
    if (unit) params.set("unit", unit);
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (revenue !== "all") params.set("revenue", revenue);

    try {
      const res = await fetch(`/api/audience?${params.toString()}`, {
        signal: ac.signal,
        cache: "no-store",
      });
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
  }, [page, unit, segment, city, revenue]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const masked = data?.masked ?? false;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? AUDIENCE_DEFAULT_PAGE_SIZE;
  const rows = data?.rows ?? [];
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + rows.length;
  const hasNext = page * pageSize < total;

  const onFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            Audience
          </h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">
            Pool audiens tunggal — {total.toLocaleString("id-ID")} profil dibaca langsung dari{" "}
            <span className="font-mono text-[13px]">master_customer</span> (baca saja).
          </p>
        </div>
        {masked && (
          <Badge tone="amber" className="gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Kontak disamarkan
          </Badge>
        )}
      </header>

      <QualityBanner />

      {/* Filters. No segment builder, no export, no edit — evaluation only. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="Cari kota…"
            className="h-10 w-52 rounded-sm border border-glass-border bg-glass pl-9 pr-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
          />
        </div>

        <select
          aria-label="Filter unit"
          className={selectCls}
          value={unit}
          onChange={(e) => onFilterChange(setUnit)(e.target.value)}
        >
          <option value="">Semua unit</option>
          {AUDIENCE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter segment"
          className={selectCls}
          value={segment}
          onChange={(e) => onFilterChange(setSegment)(e.target.value)}
        >
          <option value="">Semua segment</option>
          {AUDIENCE_SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={SEGMENT_NULL}>(tanpa segment)</option>
        </select>

        <select
          aria-label="Filter revenue"
          className={selectCls}
          value={revenue}
          onChange={(e) => {
            setRevenue(e.target.value as RevenueFilter);
            setPage(1);
          }}
        >
          <option value="all">Semua revenue</option>
          <option value="has">Pernah membayar</option>
          <option value="none">Belum membayar</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-card border border-glass-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-bold">Nama</th>
              <th className="px-4 py-3 font-bold">
                <span className="inline-flex items-center gap-1.5">
                  Telepon {masked && <Lock className="h-3 w-3 text-amber" />}
                </span>
              </th>
              <th className="px-4 py-3 font-bold">
                <span className="inline-flex items-center gap-1.5">
                  Email {masked && <Lock className="h-3 w-3 text-amber" />}
                </span>
              </th>
              <th className="px-4 py-3 font-bold">Kota</th>
              <th className="px-4 py-3 font-bold">Unit</th>
              <th className="px-4 py-3 font-bold">Segment</th>
              <th className="px-4 py-3 text-right font-bold">Lifetime value</th>
              <th className="px-4 py-3 font-bold">Dibuat</th>
            </tr>
          </thead>
          <tbody className="font-body text-[14px] text-ink">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-ink-soft">
                  Memuat…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <Badge tone="red">Gagal</Badge>
                  <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-ink-soft">
                  Tidak ada profil yang cocok dengan filter ini.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={firstRow + i} className="border-b border-glass-border last:border-0 hover:bg-glass">
                  <td className="px-4 py-3">{r.full_name ? r.full_name : <Empty />}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.phone ? r.phone : <Empty />}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.email ? r.email : <Empty />}</td>
                  <td className="px-4 py-3">{r.city ? r.city : <Empty />}</td>
                  <td className="px-4 py-3">{r.first_unit ? r.first_unit : <Empty />}</td>
                  <td className="px-4 py-3">
                    {r.segment ? (
                      <Badge tone="neutral">{r.segment}</Badge>
                    ) : (
                      <span className="font-body text-[13px] italic text-ink-faint">(tanpa segment)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px]">
                    {r.lifetime_value != null ? (
                      r.lifetime_value > 0 ? (
                        idr.format(r.lifetime_value)
                      ) : (
                        <span className="text-ink-faint">Rp 0</span>
                      )
                    ) : (
                      <Empty />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{formatDate(r.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-faint">
          {total === 0
            ? "0 profil"
            : `Menampilkan ${firstRow.toLocaleString("id-ID")}–${lastRow.toLocaleString("id-ID")} dari ${total.toLocaleString("id-ID")}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="font-mono text-[12px] text-ink-soft">Hal {page}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || !hasNext}
            className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>

      <p className="font-mono text-[11px] text-ink-faint">
        Baca saja · nol tombol ekspor/edit/hapus · setiap pembukaan daftar tercatat di audit log
        (list.viewed) · kontak disamarkan di server untuk peran analyst.
      </p>
    </div>
  );
}
