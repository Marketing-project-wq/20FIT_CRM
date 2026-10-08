"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { RefreshCw, Users, Layers, Wallet, Network, MapPin, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarList, type BarItem } from "@/components/dashboard/bar-list";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct, formatRupiah, formatDecimal, type Lang } from "@/lib/i18n";
import type { Customer360Data, CrossUnitMatrix, RevenueByUnitRow, UnitCombination } from "@/lib/crm/customer-360";

type Te = ReturnType<typeof useI18n>["t"]["customer360"];

/** Stable per-unit colour (CSS var, dark-mode safe). Known units get a fixed hue; extras cycle. */
const UNIT_COLOR: Record<string, string> = {
  membership: "var(--blue)",
  event: "var(--green)",
  arena: "var(--amber)",
  clinic: "var(--red)",
  shop: "var(--ink-soft)",
  gym: "var(--ink-faint)",
};
const FALLBACK_COLORS = ["var(--blue)", "var(--green)", "var(--amber)", "var(--red)", "var(--ink-soft)", "var(--ink-faint)"];
function colorFor(unit: string, idx: number): string {
  return UNIT_COLOR[unit] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/** Tailwind fill class per unit for BarList (which colours via className, not inline style). */
const UNIT_BAR_CLASS: Record<string, string> = {
  membership: "bg-blue",
  event: "bg-green",
  arena: "bg-amber",
  clinic: "bg-red",
  shop: "bg-ink-soft",
  gym: "bg-ink-faint",
};
function barClassFor(unit: string): string {
  return UNIT_BAR_CLASS[unit] ?? "bg-blue";
}

function unitLabel(unit: string, te: Te): string {
  const key = ("unit" + unit.charAt(0).toUpperCase() + unit.slice(1)) as keyof Te;
  const label = te[key];
  if (typeof label === "string") return label;
  return unit.charAt(0).toUpperCase() + unit.slice(1);
}

export function Customer360Analysis({ data: initialData }: { data: Customer360Data }) {
  const { lang, t } = useI18n();
  const te = t.customer360;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/customer-360");
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as Customer360Data;
      if (id === fetchRef.current) setData(json);
    } catch {
      if (id === fetchRef.current) setError(te.loadFailed);
    } finally {
      if (id === fetchRef.current) setLoading(false);
    }
  }, [te.loadFailed]);

  const multiUnitPct = data.totalCustomers > 0
    ? Math.round((data.multiUnitUsers / data.totalCustomers) * 1000) / 10
    : 0;

  const dim = loading ? "pointer-events-none opacity-50" : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{te.title}</h1>
          <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">{te.subtitle}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-faint">
            {te.computed} {new Date(data.generatedAt).toLocaleString(lang === "id" ? "id-ID" : "en-US")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {te.refresh}
        </Button>
      </div>

      {error && (
        <div className="card flex items-center justify-between gap-3 p-4" style={{ borderColor: "color-mix(in srgb, var(--red) 35%, transparent)" }}>
          <p className="font-body text-[13px] text-red">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>{te.retry}</Button>
        </div>
      )}

      {data.totalCustomers === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="font-body text-[14px] text-ink-soft">{te.noData}</p>
        </div>
      ) : (
        <div className={`flex flex-col gap-6 ${dim}`}>
          {/* Area 1: KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={te.totalCustomers}
              value={formatCount(data.totalCustomers, lang)}
              hint={te.totalCustomersHint}
              icon={<Users className="h-4 w-4" />}
              info={<InfoTooltip content={te.tooltipTotalCustomers} />}
            />
            <StatCard
              label={te.multiUnitUsers}
              value={formatCount(data.multiUnitUsers, lang)}
              hint={te.multiUnitUsersHint.replace("{pct}", formatPct(multiUnitPct, lang))}
              icon={<Network className="h-4 w-4" />}
              info={<InfoTooltip content={te.tooltipMultiUnit} />}
            />
            <StatCard
              label={te.avgUnitsPerUser}
              value={formatDecimal(data.avgUnitsPerUser, lang, 1)}
              hint={te.avgUnitsPerUserHint}
              icon={<Layers className="h-4 w-4" />}
              info={<InfoTooltip content={te.tooltipAvgUnits} />}
            />
            <StatCard
              label={te.totalRevenue}
              value={formatRupiah(data.totalRevenue, lang)}
              hint={te.totalRevenueHint.replace("{n}", formatCount(data.revenueByUnit.reduce((s, r) => s + r.txnCount, 0), lang))}
              icon={<Wallet className="h-4 w-4" />}
              info={<InfoTooltip content={te.tooltipRevenue} />}
            />
          </div>

          {/* Area 2 + 6b: Unit breakdown + Units-per-customer distribution */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <SectionHead title={te.unitBreakdown} desc={te.unitBreakdownDesc} info={te.tooltipUnitDist} />
              <div className="mt-4">
                <BarList
                  lang={lang}
                  items={data.unitBreakdown.map<BarItem>((u) => ({
                    label: unitLabel(u.unit, te),
                    value: u.users,
                    barClass: barClassFor(u.unit),
                  }))}
                />
              </div>
            </section>

            <section className="card p-5">
              <SectionHead title={te.unitDistribution} desc={te.unitDistributionDesc} info={te.tooltipUnitsPerCustomer} />
              <div className="mt-4">
                <BarList
                  lang={lang}
                  barClass="bg-blue"
                  items={data.unitCountDistribution.map<BarItem>((d) => ({
                    label: te.distUnits.replace("{n}", String(d.unitCount)),
                    value: d.users,
                  }))}
                />
              </div>
            </section>
          </div>

          {/* Area 3: Cross-unit matrix */}
          <section className="card p-5">
            <SectionHead title={te.crossUnitMatrix} desc={te.crossUnitMatrixDesc} icon={<Network className="h-5 w-5 text-blue" aria-hidden />} info={te.tooltipMatrix} />
            <CrossUnitHeatmap matrix={data.crossUnitMatrix} lang={lang} te={te} />
          </section>

          {/* Area 4: Revenue by unit */}
          <section className="card p-5">
            <SectionHead title={te.revenueByUnit} desc={te.revenueByUnitDesc} icon={<Wallet className="h-5 w-5 text-green" aria-hidden />} info={te.tooltipRevenueUnit} />
            {data.revenueByUnit.length === 0 ? (
              <p className="mt-4 font-body text-[13px] text-ink-faint">{te.noData}</p>
            ) : (
              <RevenueByUnit rows={data.revenueByUnit} total={data.totalRevenue} lang={lang} te={te} />
            )}
          </section>

          {/* Area 5: Top combinations */}
          <section className="card p-5">
            <SectionHead title={te.topCombinations} desc={te.topCombinationsDesc} icon={<GitMerge className="h-5 w-5 text-amber" aria-hidden />} info={te.tooltipCombinations} />
            {data.topCombinations.length === 0 ? (
              <p className="mt-4 font-body text-[13px] text-ink-faint">{te.noData}</p>
            ) : (
              <CombinationsTable combos={data.topCombinations} lang={lang} te={te} />
            )}
          </section>

          {/* Area 6: Journey — entry unit */}
          <section className="card p-5">
            <SectionHead title={te.userJourney} desc={te.userJourneyDesc} icon={<MapPin className="h-5 w-5 text-red" aria-hidden />} info={te.tooltipJourney} />
            <p className="mt-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {te.entryUnitLabel}
            </p>
            <div className="mt-2">
              <BarList
                lang={lang}
                items={data.entryUnits.map<BarItem>((u) => ({
                  label: unitLabel(u.unit, te),
                  value: u.users,
                  barClass: barClassFor(u.unit),
                }))}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, desc, icon, info }: { title: string; desc?: string; icon?: React.ReactNode; info?: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">
        {icon}
        {title}
        {info && <InfoTooltip content={info} />}
      </h2>
      {desc && <p className="mt-1 font-body text-[13px] text-ink-soft">{desc}</p>}
    </div>
  );
}

/**
 * Small ⓘ popover explaining a section's data source / method. Click to toggle (works on touch),
 * closes on outside-click, Escape, or scroll/resize. Dark-mode safe (glass-strong + design tokens).
 * Mobile-safe: the panel is positioned with `fixed` against measured viewport coordinates and its
 * left edge is clamped to a margin, so it can never run off-screen however far right the icon sits.
 * Content uses `\n\n` for paragraph breaks, rendered with whitespace-pre-line.
 */
function InfoTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(288, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    setPos({ top: r.bottom + 8, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const close = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, place]);

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="text-ink-faint transition-colors hover:text-ink-soft"
        aria-label="Info"
        aria-expanded={open}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7v4M8 5.5v-.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && pos && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <span
            role="note"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="glass-strong z-50 block whitespace-pre-line rounded-lg border border-glass-border p-3 font-body text-[12px] font-normal leading-relaxed text-ink shadow-[var(--shadow-glass-lg)]"
          >
            {content}
          </span>
        </>
      )}
    </span>
  );
}

/* ── Area 3: Cross-unit heatmap ── */

function heatBg(value: number, max: number): string | undefined {
  if (value <= 0 || max <= 0) return undefined;
  const pct = Math.max(Math.round((value / max) * 55) + 8, 8);
  return `color-mix(in srgb, var(--blue) ${pct}%, transparent)`;
}

function CrossUnitHeatmap({ matrix, lang, te }: { matrix: CrossUnitMatrix; lang: Lang; te: Te }) {
  const n = matrix.units.length;
  // Scale off-diagonal intensity to the largest off-diagonal overlap (diagonals dwarf them).
  let maxOff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) maxOff = Math.max(maxOff, matrix.cells[i][j]);
    }
  }

  if (n === 0) return <p className="mt-4 font-body text-[13px] text-ink-faint">{te.noData}</p>;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="sticky left-0 z-10 min-w-[6rem] bg-surface px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint" />
            {matrix.units.map((u) => (
              <th key={u} className="px-3 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint" title={unitLabel(u, te)}>
                <span className="inline-block max-w-[5rem] truncate">{unitLabel(u, te)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.units.map((rowUnit, i) => (
            <tr key={rowUnit} className={i < n - 1 ? "border-b border-surface-border/50" : ""}>
              <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-body text-[12px] font-semibold text-ink">
                {unitLabel(rowUnit, te)}
              </td>
              {matrix.units.map((colUnit, j) => {
                const value = matrix.cells[i][j];
                const diag = i === j;
                return (
                  <td key={colUnit} className="px-2 py-2 text-center">
                    <span
                      className={`inline-block min-w-[2.75rem] rounded-sm px-2 py-1 font-mono text-[11px] font-semibold tabular-nums ${diag ? "bg-surface-2 text-ink" : value > 0 ? "text-ink" : "text-ink-faint"}`}
                      style={{ backgroundColor: diag ? undefined : heatBg(value, maxOff) }}
                      title={`${unitLabel(rowUnit, te)} ∩ ${unitLabel(colUnit, te)}: ${formatCount(value, lang)} ${te.customers}`}
                    >
                      {value > 0 ? formatCount(value, lang) : "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Area 4: Revenue donut + table ── */

function RevenueByUnit({ rows, total, lang, te }: { rows: RevenueByUnitRow[]; total: number; lang: Lang; te: Te }) {
  const safeTotal = total > 0 ? total : rows.reduce((s, r) => s + r.totalRevenue, 0);
  const top = rows[0];
  const topPct = safeTotal > 0 && top ? Math.round((top.totalRevenue / safeTotal) * 1000) / 10 : 0;

  // SVG donut geometry.
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segments = rows.map((r, i) => {
    const frac = safeTotal > 0 ? r.totalRevenue / safeTotal : 0;
    const len = frac * C;
    const seg = { color: colorFor(r.unit, i), dash: `${len} ${C - len}`, dashOffset: -offset, unit: r.unit };
    offset += len;
    return seg;
  });

  return (
    <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-center">
      {/* Donut */}
      <div className="flex shrink-0 items-center gap-4">
        <svg viewBox="0 0 180 180" className="h-40 w-40" role="img" aria-label={te.revenueByUnit}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="24" />
          {segments.map((s) => (
            <circle
              key={s.unit}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="24"
              strokeDasharray={s.dash}
              strokeDashoffset={s.dashOffset}
              transform="rotate(-90 90 90)"
            />
          ))}
          <text x="90" y="84" textAnchor="middle" className="font-display" style={{ fontSize: 26, fontWeight: 700, fill: "var(--ink)" }}>
            {formatPct(topPct, lang)}
          </text>
          <text x="90" y="104" textAnchor="middle" className="font-body" style={{ fontSize: 11, fill: "var(--ink-faint)" }}>
            {top ? unitLabel(top.unit, te) : ""}
          </text>
        </svg>
        {/* Legend */}
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.unit} className="flex items-center gap-2 font-body text-[12px] text-ink-soft">
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: colorFor(r.unit, i) }} aria-hidden />
              <span className="text-ink">{unitLabel(r.unit, te)}</span>
              <span className="text-ink-faint">
                {safeTotal > 0 ? formatPct(Math.round((r.totalRevenue / safeTotal) * 1000) / 10, lang) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thUnit}</th>
              <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thTxns}</th>
              <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thRevenue}</th>
              <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thUniqueCustomers}</th>
              <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thShare}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.unit} className={i < rows.length - 1 ? "border-b border-surface-border/50" : ""}>
                <td className="px-3 py-2 font-body text-[13px] font-semibold text-ink">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorFor(r.unit, i) }} aria-hidden />
                    {unitLabel(r.unit, te)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-soft">{formatCount(r.txnCount, lang)}</td>
                <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{formatRupiah(r.totalRevenue, lang)}</td>
                <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-soft">{formatCount(r.uniqueCustomers, lang)}</td>
                <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-soft">
                  {safeTotal > 0 ? formatPct(Math.round((r.totalRevenue / safeTotal) * 1000) / 10, lang) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-surface-border bg-surface-2/50">
              <td className="px-3 py-2 font-display text-[11px] font-bold uppercase text-ink-faint">Total</td>
              <td className="px-3 py-2 text-right font-mono text-[12px] font-bold tabular-nums text-ink-soft">
                {formatCount(rows.reduce((s, r) => s + r.txnCount, 0), lang)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-[12px] font-bold tabular-nums text-ink">{formatRupiah(safeTotal, lang)}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── Area 5: Combinations table ── */

function CombinationsTable({ combos, lang, te }: { combos: UnitCombination[]; lang: Lang; te: Te }) {
  const max = combos.reduce((m, c) => Math.max(m, c.userCount), 0);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thCombination}</th>
            <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thUnitCount}</th>
            <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{te.thUsers}</th>
            <th className="w-1/3 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {combos.map((c, i) => (
            <tr key={c.units.join("+")} className={i < combos.length - 1 ? "border-b border-surface-border/50" : ""}>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-1">
                  {c.units.map((u, j) => (
                    <span
                      key={u}
                      className="rounded-full px-2 py-0.5 font-body text-[11px] font-semibold text-white"
                      style={{ backgroundColor: colorFor(u, j) }}
                    >
                      {unitLabel(u, te)}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink-soft">{formatCount(c.unitCount, lang)}</td>
              <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(c.userCount, lang)}</td>
              <td className="px-3 py-2">
                <span className="block h-2.5 overflow-hidden rounded-full bg-surface-border" aria-hidden>
                  <span className="block h-full rounded-full bg-blue" style={{ width: `${max > 0 ? Math.max((c.userCount / max) * 100, 1.5) : 0}%` }} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
