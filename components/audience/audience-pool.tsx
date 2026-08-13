"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, AlertTriangle, Search } from "lucide-react";
import { formatDisplayName } from "@/lib/crm/display-name";
import { Badge } from "@/components/ui/badge";
import { ProfileSearch } from "@/components/audience/profile-search";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatDate as fmtDate, type Lang } from "@/lib/i18n";
import {
  SEGMENT_NULL,
  AUDIENCE_UNITS,
  AUDIENCE_SEGMENTS,
  AUDIENCE_DEFAULT_PAGE_SIZE,
} from "@/lib/crm/audience-constants";

// Row shape mirrors lib/crm/audience.ts AudienceRow (phone/email already masked
// server-side when `masked`). customer_id IS received (Sprint 3C) — used only as the
// link target for the profile detail, never rendered as a display column.
interface Row {
  customer_id: string;
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

/** Lifetime value with locale-aware grouping; keeps the "Rp" symbol and shows "Rp 0" as-is. */
function formatIdr(value: number, lang: Lang): string {
  return `Rp ${formatCount(value, lang)}`;
}

/** Explicitly-empty cell. Empty data is SHOWN, never hidden (Sprint 3A honesty rule);
 *  the label is "belum terisi" / "not filled in" — the field is blank, not a measured zero. */
function Empty() {
  const { t } = useI18n();
  return <span className="font-body text-[13px] italic text-ink-faint">{t.audience.empty}</span>;
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
  const { t } = useI18n();
  const w = t.audience.warn;
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{w.bannerTitle}</h2>
      </div>
      <ul className="mt-3 space-y-1.5 font-body text-[13px] leading-relaxed text-ink-soft">
        <li>{w.bannerGender}</li>
        <li>{w.bannerCity}</li>
        <li>{w.bannerLtv}</li>
        <li>{w.bannerSegment}</li>
        <li>
          {w.bannerLastActiveA}
          <span className="font-mono text-[12px]">last_activity_at</span>
          {w.bannerLastActiveB}
        </li>
      </ul>
      <p className="mt-3 font-body text-[13px] text-ink-soft">
        {w.bannerFooterA}
        <Link href="/quality" className="font-semibold text-ink underline underline-offset-2">
          {t.nav.quality}
        </Link>
        {w.bannerFooterB}
      </p>
    </div>
  );
}

const selectCls =
  "h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

export function AudiencePool() {
  const { lang, t } = useI18n();
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
        setError(body?.message || `${t.audience.loadFailed} (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as ApiResult);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(t.audience.connFailed);
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [page, unit, segment, city, revenue, t]);

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
            {t.nav.audience}
          </h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">
            {t.audience.subtitlePre}{formatCount(total, lang)}{t.audience.subtitleMid}
            <span className="font-mono text-[13px]">master_customer</span>{t.audience.subtitlePost}
          </p>
        </div>
        {masked && (
          <Badge tone="amber" className="gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            {t.audience.maskedBadge}
          </Badge>
        )}
      </header>

      <QualityBanner />

      {/* Find ONE person (search.performed). Above the filters, visually separate. */}
      <ProfileSearch />

      {/* Filter the LIST (list.viewed). Distinct from the single-person search above:
          this browses a paged, audited-as-a-list view. No segment builder, no export,
          no edit — evaluation only. */}
      <div className="space-y-2">
        <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">
          {t.audience.filterListLabel}
        </p>
        <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder={t.audience.cityPlaceholder}
            className="h-10 w-52 rounded-sm border border-glass-border bg-glass pl-9 pr-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
          />
        </div>

        <select
          aria-label={t.audience.ariaUnit}
          className={selectCls}
          value={unit}
          onChange={(e) => onFilterChange(setUnit)(e.target.value)}
        >
          <option value="">{t.audience.allUnits}</option>
          {AUDIENCE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <select
          aria-label={t.audience.ariaSegment}
          className={selectCls}
          value={segment}
          onChange={(e) => onFilterChange(setSegment)(e.target.value)}
        >
          <option value="">{t.audience.allSegments}</option>
          {AUDIENCE_SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={SEGMENT_NULL}>{t.audience.noSegment}</option>
        </select>

        <select
          aria-label={t.audience.ariaRevenue}
          className={selectCls}
          value={revenue}
          onChange={(e) => {
            setRevenue(e.target.value as RevenueFilter);
            setPage(1);
          }}
        >
          <option value="all">{t.audience.allRevenue}</option>
          <option value="has">{t.audience.hasPaid}</option>
          <option value="none">{t.audience.notPaid}</option>
        </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-card border border-glass-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-bold">{t.audience.thName}</th>
              <th className="px-4 py-3 font-bold">
                <span className="inline-flex items-center gap-1.5">
                  {t.audience.thPhone} {masked && <Lock className="h-3 w-3 text-amber" />}
                </span>
              </th>
              <th className="px-4 py-3 font-bold">
                <span className="inline-flex items-center gap-1.5">
                  {t.audience.thEmail} {masked && <Lock className="h-3 w-3 text-amber" />}
                </span>
              </th>
              <th className="px-4 py-3 font-bold">{t.audience.thCity}</th>
              <th className="px-4 py-3 font-bold">{t.audience.thUnit}</th>
              <th className="px-4 py-3 font-bold">{t.audience.thSegment}</th>
              <th className="px-4 py-3 text-right font-bold">{t.audience.thLtv}</th>
              <th className="px-4 py-3 font-bold">{t.audience.thCreated}</th>
            </tr>
          </thead>
          <tbody className="font-body text-[14px] text-ink">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-ink-soft">
                  {t.audience.loading}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <Badge tone="red">{t.audience.failed}</Badge>
                  <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-ink-soft">
                  {t.audience.noMatch}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.customer_id} className="border-b border-glass-border last:border-0 hover:bg-glass">
                  <td className="px-4 py-3">
                    <Link
                      href={`/audience/${r.customer_id}`}
                      className="font-semibold text-ink underline decoration-glass-border underline-offset-2 hover:decoration-red"
                    >
                      {formatDisplayName(r.full_name) ?? t.audience.noName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.phone ? r.phone : <Empty />}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.email ? r.email : <Empty />}</td>
                  <td className="px-4 py-3">{r.city ? r.city : <Empty />}</td>
                  <td className="px-4 py-3">{r.first_unit ? r.first_unit : <Empty />}</td>
                  <td className="px-4 py-3">
                    {r.segment ? (
                      <Badge tone="neutral">{r.segment}</Badge>
                    ) : (
                      <span className="font-body text-[13px] italic text-ink-faint">{t.audience.noSegment}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px]">
                    {r.lifetime_value != null ? (
                      r.lifetime_value > 0 ? (
                        formatIdr(r.lifetime_value, lang)
                      ) : (
                        <span className="text-ink-faint">Rp 0</span>
                      )
                    ) : (
                      <Empty />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{fmtDate(r.created_at, lang)}</td>
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
            ? t.audience.zeroProfiles
            : `${t.audience.showingPre}${formatCount(firstRow, lang)}–${formatCount(lastRow, lang)}${t.audience.showingOf}${formatCount(total, lang)}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.audience.prev}
          </button>
          <span className="font-mono text-[12px] text-ink-soft">{t.audience.pageLabel} {formatCount(page, lang)}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || !hasNext}
            className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.audience.next}
          </button>
        </div>
      </div>

      <p className="font-mono text-[11px] text-ink-faint">{t.audience.warn.footer}</p>
    </div>
  );
}
