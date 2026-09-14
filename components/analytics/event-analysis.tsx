"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Printer, RefreshCw, ChevronDown, ChevronRight, TrendingDown, TrendingUp, X, Search, Check, Filter, ArrowUpRight, ArrowDownRight, Equal, Trophy, AlertTriangle, Heart, Users, BarChart3, Lightbulb, Target, MessageCircle, MapPin, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventAnalyticsData, EventGroup, EventComparison, DemographicBreakdown, Insight, InsightCategory, LifecycleFunnel, CategoryGrowthRow, OverlapMatrix, RevenueAnalysis, GeoExpansion } from "@/lib/crm/event-analytics";
import { EventAnalysisLoader } from "@/components/analytics/event-analysis-loader";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct, type Lang } from "@/lib/i18n";

const DEFAULT_ROWS = 10;
const DEBOUNCE_MS = 500;

interface GroupOption {
  key: string;
  label: string;
}

export function EventAnalysis({
  data: initialData,
  nowMs,
  allGroups,
}: {
  data: EventAnalyticsData;
  nowMs: number;
  allGroups: GroupOption[];
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const te = t.eventAnalysis;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"groups" | "all">("groups");
  const [showAllRows, setShowAllRows] = useState(false);

  const eventsParam = searchParams.get("events");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(() => {
    if (!eventsParam) return new Set<string>();
    return new Set(eventsParam.split(",").filter(Boolean));
  });
  const [dateFrom, setDateFrom] = useState(fromParam ?? "");
  const [dateTo, setDateTo] = useState(toParam ?? "");

  const updateUrl = useCallback(
    (events: Set<string>, from: string, to: string) => {
      const p = new URLSearchParams();
      if (events.size > 0) p.set("events", Array.from(events).join(","));
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
    },
    [router, pathname],
  );

  const fetchRef = useRef(0);

  const fetchFiltered = useCallback(
    async (events: Set<string>, from: string, to: string) => {
      const id = ++fetchRef.current;
      setLoading(true);
      try {
        const p = new URLSearchParams();
        if (events.size > 0) p.set("events", Array.from(events).join(","));
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        const res = await fetch(`/api/analytics/events?${p.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (id === fetchRef.current) setData(json);
      } finally {
        if (id === fetchRef.current) setLoading(false);
      }
    },
    [],
  );

  const hasFilter = selectedEvents.size > 0 || dateFrom !== "" || dateTo !== "";

  useEffect(() => {
    if (!hasFilter) {
      setData(initialData);
      return;
    }
    const timer = setTimeout(() => {
      fetchFiltered(selectedEvents, dateFrom, dateTo);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvents, dateFrom, dateTo]);

  const toggleEvent = useCallback(
    (key: string) => {
      setSelectedEvents((prev) => {
        const next = new Set(prev);
        const slug = key.startsWith("event:") ? key.slice(6) : key;
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        updateUrl(next, dateFrom, dateTo);
        return next;
      });
    },
    [dateFrom, dateTo, updateUrl],
  );

  const clearFilters = useCallback(() => {
    setSelectedEvents(new Set());
    setDateFrom("");
    setDateTo("");
    updateUrl(new Set(), "", "");
    setData(initialData);
  }, [updateUrl, initialData]);

  const handleDateFrom = useCallback(
    (v: string) => {
      setDateFrom(v);
      updateUrl(selectedEvents, v, dateTo);
    },
    [selectedEvents, dateTo, updateUrl],
  );

  const handleDateTo = useCallback(
    (v: string) => {
      setDateTo(v);
      updateUrl(selectedEvents, dateFrom, v);
    },
    [selectedEvents, dateFrom, updateUrl],
  );

  const applyPreset = useCallback(
    (preset: string) => {
      const now = new Date();
      let from = "";
      const to = now.toISOString().slice(0, 10);
      if (preset === "3m") {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        from = d.toISOString().slice(0, 10);
      } else if (preset === "6m") {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 6);
        from = d.toISOString().slice(0, 10);
      } else if (preset === "1y") {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        from = d.toISOString().slice(0, 10);
      } else if (preset === "ytd") {
        from = `${now.getFullYear()}-01-01`;
      }
      setDateFrom(from);
      setDateTo(to);
      updateUrl(selectedEvents, from, to);
    },
    [selectedEvents, updateUrl],
  );

  const displayItems =
    viewMode === "groups"
      ? data.groups.map((g) => ({
          key: g.groupKey,
          label: g.groupLabel,
          total: g.total,
          newCount: g.newCount,
          returning: g.returning,
          subCount: g.subEvents.length,
        }))
      : data.events.map((e) => ({
          key: e.slug,
          label: e.label,
          total: e.total,
          newCount: e.newCount,
          returning: e.returning,
          subCount: 1,
        }));

  const sorted = displayItems.slice().sort((a, b) => b.total - a.total);
  const visible = showAllRows ? sorted : sorted.slice(0, DEFAULT_ROWS);
  const hasMore = sorted.length > DEFAULT_ROWS;
  const maxTotal = Math.max(...sorted.map((e) => e.total), 1);

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      {/* Print-only styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          nav, header, [data-sidebar], [data-shell-header] { display: none !important; }
          .print-header { display: block !important; }
          table { page-break-inside: avoid; }
          section { page-break-inside: avoid; }
          .card { border: 1px solid #ddd !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Print-only header */}
      <div className="print-header mb-4 hidden border-b-2 border-ink pb-3 print:block">
        <h1 className="font-display text-[24px] font-black uppercase text-ink">{te.printTitle}</h1>
        <p className="mt-1 font-body text-[12px] text-ink-soft">
          {te.printGenerated} {new Date().toLocaleString(lang === "id" ? "id-ID" : "en-US")}
        </p>
        {hasFilter && (
          <p className="mt-0.5 font-body text-[11px] text-ink-faint">
            {te.printFilterLabel}{" "}
            {selectedEvents.size > 0 && `${selectedEvents.size} events`}
            {dateFrom && ` | ${te.filterFrom}: ${dateFrom}`}
            {dateTo && ` | ${te.filterTo}: ${dateTo}`}
          </p>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            {te.title}
          </h1>
          <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">{te.subtitle}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-faint">
            {te.computed} {new Date(nowMs).toLocaleString(lang === "id" ? "id-ID" : "en-US")}
            {" · "}
            {data.groups.length} {te.groups}, {data.events.length} {te.subEvents}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden />
            {te.printPdf}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        allGroups={allGroups}
        selectedEvents={selectedEvents}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onToggleEvent={toggleEvent}
        onDateFrom={handleDateFrom}
        onDateTo={handleDateTo}
        onClear={clearFilters}
        onPreset={applyPreset}
        hasFilter={hasFilter}
        loading={loading}
        te={te}
      />

      {/* Inline loader overlay for refetch */}
      {loading && (
        <EventAnalysisLoader variant="inline" />
      )}

      {/* View Toggle */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <span className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
          {te.viewLabel}
        </span>
        <div className="inline-flex overflow-hidden rounded-sm border border-surface-border">
          <button
            type="button"
            onClick={() => {
              setViewMode("groups");
              setShowAllRows(false);
            }}
            className={`px-3 py-1.5 font-body text-[13px] font-semibold transition-colors ${
              viewMode === "groups"
                ? "bg-red text-white"
                : "bg-surface-2 text-ink hover:bg-surface-border"
            }`}
          >
            {te.viewGrouped} ({data.groups.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("all");
              setShowAllRows(false);
            }}
            className={`border-l border-surface-border px-3 py-1.5 font-body text-[13px] font-semibold transition-colors ${
              viewMode === "all"
                ? "bg-red text-white"
                : "bg-surface-2 text-ink hover:bg-surface-border"
            }`}
          >
            {te.viewAll} ({data.events.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className={loading ? "pointer-events-none opacity-50" : ""}>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.quickAnswers}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            value={formatCount(data.totalPeople, lang)}
            label={te.kpiAttended}
            tone="green"
          />
          <KpiCard
            value={`${formatCount(data.returningPeople, lang)} (${formatPct(data.returningPct, lang)})`}
            label={te.kpiReturned}
            tone="green"
          />
          <KpiCard
            value={
              data.frequentPeople > 0
                ? formatCount(data.frequentPeople, lang)
                : `${data.avgGroupsPerPerson}`
            }
            label={
              data.frequentPeople > 0
                ? te.kpiFrequent.replace("{avg}", String(data.avgGroupsPerPerson))
                : te.kpiAvgEvents
            }
            tone={data.frequentPeople > 0 ? "green" : "amber"}
          />
        </div>
      </section>

      {/* Attendance Table */}
      <section className={loading ? "pointer-events-none opacity-50" : ""}>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.attendance}</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {viewMode === "groups" ? te.thEvent : te.thSubEvent}
                </th>
                {viewMode === "groups" && (
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {te.thVariants}
                  </th>
                )}
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Total
                </th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {te.thNew}
                </th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {te.thReturning}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ev, i) => (
                <AttendanceRow
                  key={ev.key}
                  item={ev}
                  group={
                    viewMode === "groups" ? data.groups.find((g) => g.groupKey === ev.key) : undefined
                  }
                  isLast={i === visible.length - 1}
                  isFirst={sorted.indexOf(ev) === 0}
                  showVariants={viewMode === "groups"}
                  lang={lang}
                />
              ))}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAllRows(!showAllRows)}
            className="mt-2 font-body text-[13px] font-semibold text-green hover:underline print:hidden"
          >
            {showAllRows
              ? te.showTop.replace("{n}", String(DEFAULT_ROWS))
              : te.showAll.replace("{n}", String(sorted.length))}
          </button>
        )}

        {/* Horizontal stacked bars */}
        <div className="mt-4 space-y-2">
          {visible.map((ev) => (
            <div
              key={ev.key}
              className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 sm:grid-cols-[10rem_1fr_auto]"
            >
              <span
                className="truncate font-body text-[12px] font-semibold text-ink"
                title={ev.label}
              >
                {ev.label}
              </span>
              <div className="flex h-4 overflow-hidden rounded-full bg-surface-2">
                {ev.returning > 0 && (
                  <span
                    className="block h-full bg-green"
                    style={{ width: `${(ev.returning / maxTotal) * 100}%` }}
                    title={`${te.legendReturning}: ${ev.returning}`}
                  />
                )}
                <span
                  className="block h-full bg-ink-faint/30"
                  style={{ width: `${(ev.newCount / maxTotal) * 100}%` }}
                  title={`${te.legendNew}: ${ev.newCount}`}
                />
              </div>
              <span className="whitespace-nowrap font-mono text-[11px] text-ink-faint">
                {formatCount(ev.total, lang)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-4">
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-green" aria-hidden />{" "}
            {te.legendReturning}
          </span>
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-ink-faint/30" aria-hidden />{" "}
            {te.legendNew}
          </span>
        </div>
      </section>

      {/* Cohort Retention */}
      <section className={loading ? "pointer-events-none opacity-50" : ""}>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.cohortTitle}</h2>
        <div className="card p-4">
          <p className="mb-3 font-body text-[13px] text-ink-soft">{te.cohortDesc}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="sticky left-0 z-10 min-w-[8rem] bg-surface px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {te.cohortFirstEvent}
                  </th>
                  <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {te.cohortPeople}
                  </th>
                  {data.groups.slice(1).map((g, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
                      title={g.groupLabel}
                    >
                      +{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohort.map((row, ri) => (
                  <tr
                    key={row.cohortEvent}
                    className={
                      ri < data.cohort.length - 1 ? "border-b border-surface-border/50" : ""
                    }
                  >
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-body text-[13px] font-semibold text-ink">
                      {row.cohortLabel}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">
                      {formatCount(row.cohortSize, lang)}
                    </td>
                    {data.groups.slice(1).map((g, i) => {
                      if (i >= row.retention.length)
                        return <td key={i} className="px-3 py-2" />;
                      const pct = row.retention[i];
                      const abs = row.retentionAbs[i];
                      const tooltip = `${abs} ${te.cohortOf} ${row.cohortSize} ${te.cohortAttendees} ${row.cohortLabel} ${te.cohortAlsoAttended} ${g.groupLabel} (${formatPct(pct, lang)})`;
                      return (
                        <td key={i} className="px-3 py-2 text-center">
                          <span
                            className="inline-block cursor-default rounded-sm px-2 py-0.5 font-display text-[12px] font-bold"
                            title={tooltip}
                            style={{
                              backgroundColor: cohortCellBg(pct),
                              color: cohortCellFg(pct),
                            }}
                          >
                            {pct > 0 ? (
                              formatPct(pct, lang)
                            ) : (
                              <span className="text-ink-faint">&mdash;</span>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 font-body text-[11px] text-ink-faint">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-red/25" aria-hidden /> 0–5%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-amber/30" aria-hidden /> 5–15%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-green/35" aria-hidden /> &gt;15%
            </span>
          </div>
        </div>
      </section>

      {/* Key Insights */}
      <KeyInsights insights={data.insights} te={te} />

      {/* Churn */}
      {data.churn.length > 0 && (
        <section className={loading ? "pointer-events-none opacity-50" : ""}>
          <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
            <TrendingDown className="mr-1.5 inline h-5 w-5 text-red" aria-hidden />
            {te.churnTitle}
          </h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Event
                  </th>
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {te.churnNotReturned}
                  </th>
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.churn.map((row, i) => (
                  <tr
                    key={row.event}
                    className={
                      i < data.churn.length - 1 ? "border-b border-surface-border/50" : ""
                    }
                  >
                    <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">
                      {row.label}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                      {formatCount(row.total, lang)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-red">
                      {formatCount(row.notReturned, lang)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink-soft">
                      {formatPct(row.notReturnedPct, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.skipAfterOneReturn > 0 && (
            <p className="mt-3 font-body text-[13px] text-ink-soft">
              {te.churnSkipReturn.replace("{n}", formatCount(data.skipAfterOneReturn, lang))}
            </p>
          )}
        </section>
      )}

      {/* Demographics */}
      {data.demographics.length > 0 && (
        <DemographicsSection demographics={data.demographics} lang={lang} te={te} loading={loading} />
      )}

      {/* Cross-Event Comparison */}
      {data.comparison && (
        <ComparisonSection comparison={data.comparison} lang={lang} te={te} loading={loading} />
      )}

      {/* A: Lifecycle Funnel */}
      {data.funnel.stages.length > 0 && (
        <FunnelSection funnel={data.funnel} lang={lang} te={te} loading={loading} />
      )}

      {/* B: Category Growth */}
      {data.categoryGrowth.length > 0 && (
        <CategoryGrowthSection rows={data.categoryGrowth} lang={lang} te={te} loading={loading} />
      )}

      {/* C: Overlap Matrix */}
      {data.overlapMatrix.groupKeys.length >= 2 && (
        <OverlapSection matrix={data.overlapMatrix} lang={lang} te={te} loading={loading} />
      )}

      {/* D: Revenue */}
      {data.revenue && (
        <RevenueSection revenue={data.revenue} lang={lang} te={te} loading={loading} />
      )}

      {/* E: Geographic Expansion */}
      {data.geoExpansion.groups.length > 0 && (
        <GeoExpansionSection geo={data.geoExpansion} lang={lang} te={te} loading={loading} />
      )}

      {/* Expandable sections */}
      <ExpandableSection title={te.dataNotes} defaultOpen={false}>
        <div className="space-y-2 font-body text-[13px] text-ink-soft">
          <p>{te.dataNote1}</p>
          <p>
            {te.dataNote2
              .replace("{groups}", String(data.groups.length))
              .replace("{events}", String(data.events.length))}
          </p>
          <p>{te.dataNote3}</p>
        </div>
      </ExpandableSection>
    </div>
  );
}

/* ── Filter Bar ── */

type Te = ReturnType<typeof useI18n>["t"]["eventAnalysis"];

function FilterBar({
  allGroups,
  selectedEvents,
  dateFrom,
  dateTo,
  onToggleEvent,
  onDateFrom,
  onDateTo,
  onClear,
  onPreset,
  hasFilter,
  loading,
  te,
}: {
  allGroups: GroupOption[];
  selectedEvents: Set<string>;
  dateFrom: string;
  dateTo: string;
  onToggleEvent: (key: string) => void;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  onClear: () => void;
  onPreset: (preset: string) => void;
  hasFilter: boolean;
  loading: boolean;
  te: Te;
}) {
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEventDropdownOpen(false);
      }
    }
    if (eventDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [eventDropdownOpen]);

  const filtered = search
    ? allGroups.filter((g) => g.label.toLowerCase().includes(search.toLowerCase()))
    : allGroups;

  const eventButtonLabel =
    selectedEvents.size === 0
      ? te.filterAllEvents
      : te.filterEventsSelected.replace("{n}", String(selectedEvents.size));

  return (
    <div className="card flex flex-col gap-4 p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-ink-faint" aria-hidden />
        <span className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
          Filter
        </span>
        {hasFilter && (
          <>
            <span className="rounded-full bg-red/10 px-2 py-0.5 font-body text-[11px] font-semibold text-red">
              {te.filterActive}
            </span>
            {loading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-ink-faint" aria-hidden />
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {/* Event Multi-select */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setEventDropdownOpen(!eventDropdownOpen)}
            className={`flex h-10 min-w-[12rem] items-center gap-2 rounded-sm border px-3 font-body text-[13px] transition-colors ${
              selectedEvents.size > 0
                ? "border-red/40 bg-red/5 text-ink"
                : "border-glass-border bg-glass text-ink"
            }`}
          >
            <span className="flex-1 text-left">{eventButtonLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          </button>

          {eventDropdownOpen && (
            <div className="glass-strong absolute left-0 top-full z-50 mt-1 w-72 shadow-[var(--shadow-glass-lg)]">
              <div className="border-b border-glass-border p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={te.filterSearchEvents}
                    className="h-8 w-full rounded-sm border border-glass-border bg-glass pl-8 pr-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
                {filtered.map((g) => {
                  const slug = g.key.startsWith("event:") ? g.key.slice(6) : g.key;
                  const checked = selectedEvents.has(slug);
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => onToggleEvent(g.key)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-body text-[13px] text-ink hover:bg-glass"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                          checked
                            ? "border-green bg-green text-white"
                            : "border-glass-border bg-transparent"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{g.label}</span>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-2 py-3 text-center font-body text-[12px] text-ink-faint">—</p>
                )}
              </div>
              {selectedEvents.size > 0 && (
                <div className="border-t border-glass-border p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClear();
                      setEventDropdownOpen(false);
                    }}
                    className="w-full rounded-sm py-1.5 font-body text-[12px] font-semibold text-red hover:bg-red/5"
                  >
                    {te.filterClear}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="font-body text-[12px] text-ink-faint">{te.filterFrom}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFrom(e.target.value)}
              className="h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink focus:border-green focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="font-body text-[12px] text-ink-faint">{te.filterTo}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateTo(e.target.value)}
              className="h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink focus:border-green focus:outline-none"
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                onDateFrom("");
                onDateTo("");
              }}
              className="ml-1 text-ink-faint hover:text-red"
              title={te.filterClear}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Date Presets */}
        <div className="flex flex-wrap gap-1.5">
          {(["3m", "6m", "1y", "ytd"] as const).map((p) => {
            const label =
              p === "3m"
                ? te.filterPreset3m
                : p === "6m"
                  ? te.filterPreset6m
                  : p === "1y"
                    ? te.filterPreset1y
                    : te.filterPresetYtd;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPreset(p)}
                className="rounded-full border border-glass-border bg-glass px-2.5 py-1 font-body text-[11px] font-semibold text-ink-soft hover:border-green hover:text-green"
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Clear All */}
        {hasFilter && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto flex items-center gap-1 rounded-md border border-red/30 bg-red/5 px-3 py-1.5 font-body text-[12px] font-semibold text-red hover:bg-red/10"
          >
            <X className="h-3.5 w-3.5" />
            {te.filterClear}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function AttendanceRow({
  item,
  group,
  isLast,
  isFirst,
  showVariants,
  lang,
}: {
  item: {
    key: string;
    label: string;
    total: number;
    newCount: number;
    returning: number;
    subCount: number;
  };
  group?: EventGroup;
  isLast: boolean;
  isFirst: boolean;
  showVariants: boolean;
  lang: Lang;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSubEvents = group && group.subEvents.length > 1;

  return (
    <>
      <tr className={isLast ? "" : "border-b border-surface-border/50"}>
        <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">
          {hasSubEvents ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-left hover:text-green"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
              )}
              {item.label}
            </button>
          ) : (
            item.label
          )}
        </td>
        {showVariants && (
          <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-faint">
            {item.subCount > 1 ? item.subCount : ""}
          </td>
        )}
        <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
          {formatCount(item.total, lang)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
          {formatCount(item.newCount, lang)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
          {isFirst && item.returning === 0 ? (
            <span className="text-ink-faint">&mdash;</span>
          ) : (
            <span className="font-semibold text-green">{formatCount(item.returning, lang)}</span>
          )}
        </td>
      </tr>
      {expanded &&
        hasSubEvents &&
        group.subEvents.map((sub, si) => (
          <tr
            key={sub.slug}
            className={
              si < group.subEvents.length - 1
                ? "border-b border-surface-border/30"
                : isLast
                  ? ""
                  : "border-b border-surface-border/50"
            }
          >
            <td className="py-1.5 pl-10 pr-4 font-body text-[12px] text-ink-soft">{sub.label}</td>
            {showVariants && <td />}
            <td colSpan={3} />
          </tr>
        ))}
    </>
  );
}

function KpiCard({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "green" | "amber" | "red";
}) {
  const color =
    tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "text-red";
  return (
    <div className="card p-5">
      <div className={`font-display text-[28px] font-semibold leading-none tabular-nums ${color}`}>
        {value}
      </div>
      <div className="mt-1.5 font-body text-[12px] text-ink-soft">{label}</div>
    </div>
  );
}

function cohortCellBg(pct: number): string | undefined {
  if (pct === 0) return undefined;
  if (pct <= 5)
    return `color-mix(in srgb, var(--red) ${Math.max(Math.round((pct / 5) * 30), 8)}%, transparent)`;
  if (pct <= 15)
    return `color-mix(in srgb, var(--amber) ${Math.max(Math.round(((pct - 5) / 10) * 30 + 10), 10)}%, transparent)`;
  return `color-mix(in srgb, var(--green) ${Math.max(Math.round((pct / 100) * 60), 15)}%, transparent)`;
}

function cohortCellFg(pct: number): string {
  if (pct === 0) return "var(--ink-faint)";
  if (pct <= 5) return "var(--red)";
  if (pct <= 15) return "var(--amber)";
  if (pct >= 50) return "white";
  return "var(--green)";
}

const INSIGHT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, TrendingDown, Trophy, AlertTriangle, Heart, Users, BarChart3, Lightbulb, Target, MessageCircle,
};

const CATEGORY_ORDER: InsightCategory[] = ["growth", "retention", "demographic", "action"];

const CATEGORY_STYLE: Record<InsightCategory, { tint: string; catKey: keyof Te }> = {
  growth: { tint: "text-blue", catKey: "insightCatGrowth" },
  retention: { tint: "text-amber", catKey: "insightCatRetention" },
  demographic: { tint: "text-purple", catKey: "insightCatDemographic" },
  action: { tint: "text-green", catKey: "insightCatAction" },
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: "border-l-green bg-green/5",
  negative: "border-l-red bg-red/5",
  neutral: "border-l-ink-faint bg-surface-raised",
};

function resolveText(template: string, replacements: Record<string, string>, te: Te): string {
  let result = template;
  for (const [key, val] of Object.entries(replacements)) {
    if (key === "gender") {
      const genderKey = val === "male" ? "insightGenderMale" : "insightGenderFemale";
      result = result.replace(`{${key}}`, (te as Record<string, string>)[genderKey] ?? val);
    } else {
      result = result.replace(`{${key}}`, val);
    }
  }
  return result;
}

function KeyInsights({ insights, te }: { insights: Insight[]; te: Te }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (insights.length === 0) {
    return (
      <section className="card px-5 py-4">
        <h2 className="mb-2 font-display text-[16px] font-bold text-ink">{te.keyInsightsTitle}</h2>
        <p className="font-body text-[13px] text-ink-faint">{te.insightNoData}</p>
      </section>
    );
  }

  const grouped = new Map<InsightCategory, Insight[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const insight of insights) {
    grouped.get(insight.category)?.push(insight);
  }

  const activeCategories = CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0);

  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4">
        <h2 className="font-display text-[16px] font-bold text-ink">{te.keyInsightsTitle}</h2>
      </div>
      <div className="grid grid-cols-1 gap-0 border-t border-surface-border md:grid-cols-2">
        {activeCategories.map((cat) => {
          const style = CATEGORY_STYLE[cat];
          const items = grouped.get(cat)!;
          const isCollapsed = collapsed[cat] ?? false;

          return (
            <div key={cat} className="border-b border-surface-border last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                className="flex w-full items-center gap-2 px-5 py-3 text-left"
              >
                <span className={`font-display text-[13px] font-semibold ${style.tint}`}>
                  {(te as Record<string, string>)[style.catKey]}
                </span>
                <span className="ml-auto text-ink-faint">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </span>
              </button>
              {!isCollapsed && (
                <div className="space-y-2 px-5 pb-4">
                  {items.map((insight, i) => {
                    const IconComp = INSIGHT_ICONS[insight.icon];
                    const text = resolveText(
                      (te as Record<string, string>)[insight.textKey] ?? "",
                      insight.replacements,
                      te,
                    );
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-lg border-l-[3px] px-3 py-2.5 ${SENTIMENT_STYLE[insight.sentiment]}`}
                      >
                        {IconComp && (
                          <IconComp
                            className={`mt-0.5 h-4 w-4 shrink-0 ${
                              insight.sentiment === "positive"
                                ? "text-green"
                                : insight.sentiment === "negative"
                                  ? "text-red"
                                  : "text-ink-faint"
                            }`}
                          />
                        )}
                        <p className="font-body text-[13px] leading-relaxed text-ink">{text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExpandableSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-[16px] font-bold text-ink">{title}</span>
        {open ? (
          <ChevronDown className="h-5 w-5 text-ink-faint" aria-hidden />
        ) : (
          <ChevronRight className="h-5 w-5 text-ink-faint" aria-hidden />
        )}
      </button>
      {open && <div className="border-t border-surface-border px-5 py-4">{children}</div>}
    </section>
  );
}

/* ── Demographics Section ── */

function GenderBar({ demo, te }: { demo: DemographicBreakdown; te: Te }) {
  if (demo.total === 0) return null;
  const mPct = Math.round((demo.gender.male / demo.total) * 1000) / 10;
  const fPct = Math.round((demo.gender.female / demo.total) * 1000) / 10;
  const uPct = Math.round((demo.gender.unknown / demo.total) * 1000) / 10;
  return (
    <div className="flex h-6 w-full overflow-hidden rounded-full">
      {demo.gender.male > 0 && (
        <span
          className="flex items-center justify-center bg-green font-mono text-[10px] font-bold text-white"
          style={{ width: `${mPct}%`, minWidth: mPct > 3 ? undefined : "1.5rem" }}
          title={`${te.demoMale}: ${demo.gender.male}`}
        >
          {mPct >= 8 ? `${mPct}%` : ""}
        </span>
      )}
      {demo.gender.female > 0 && (
        <span
          className="flex items-center justify-center bg-red font-mono text-[10px] font-bold text-white"
          style={{ width: `${fPct}%`, minWidth: fPct > 3 ? undefined : "1.5rem" }}
          title={`${te.demoFemale}: ${demo.gender.female}`}
        >
          {fPct >= 8 ? `${fPct}%` : ""}
        </span>
      )}
      {demo.gender.unknown > 0 && (
        <span
          className="flex items-center justify-center bg-ink-faint/30 font-mono text-[10px] font-bold text-ink-soft"
          style={{ width: `${uPct}%`, minWidth: uPct > 3 ? undefined : "1.5rem" }}
          title={`${te.demoUnknown}: ${demo.gender.unknown}`}
        >
          {uPct >= 8 ? `${uPct}%` : ""}
        </span>
      )}
    </div>
  );
}

function DemographicsSection({
  demographics,
  lang,
  te,
  loading,
}: {
  demographics: EventAnalyticsData["demographics"];
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  if (demographics.length === 0) return null;

  const totals = demographics.reduce(
    (acc, d) => ({
      male: acc.male + d.demographics.gender.male,
      female: acc.female + d.demographics.gender.female,
      unknown: acc.unknown + d.demographics.gender.unknown,
      total: acc.total + d.demographics.total,
    }),
    { male: 0, female: 0, unknown: 0, total: 0 },
  );

  const mPct = totals.total > 0 ? formatPct(Math.round((totals.male / totals.total) * 1000) / 10, lang) : "0%";
  const fPct = totals.total > 0 ? formatPct(Math.round((totals.female / totals.total) * 1000) / 10, lang) : "0%";
  const uPct = totals.total > 0 ? formatPct(Math.round((totals.unknown / totals.total) * 1000) / 10, lang) : "0%";

  const ageTotals: number[] = [];
  if (demographics.length > 0) {
    for (let i = 0; i < demographics[0].demographics.ageBrackets.length; i++) {
      ageTotals.push(demographics.reduce((sum, d) => sum + d.demographics.ageBrackets[i].count, 0));
    }
  }

  const cityTotals = new Map<string, number>();
  for (const d of demographics) {
    for (const c of d.demographics.topCities) {
      cityTotals.set(c.city, (cityTotals.get(c.city) ?? 0) + c.count);
    }
  }
  const sortedCities = Array.from(cityTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCityCount = sortedCities.length > 0 ? sortedCities[0][1] : 1;

  return (
    <section className={loading ? "pointer-events-none opacity-50" : ""}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.demoTitle}</h2>

      {/* Gender */}
      <div className="card mb-4 p-4">
        <h3 className="mb-2 font-display text-[14px] font-semibold text-ink">{te.demoGenderTitle}</h3>
        <p className="mb-3 font-body text-[12px] text-ink-soft">
          {te.demoGenderSummary.replace("{malePct}", mPct).replace("{femalePct}", fPct).replace("{unknownPct}", uPct)}
        </p>
        <div className="space-y-2">
          {demographics.map((d) => (
            <div key={d.groupKey} className="grid grid-cols-[8rem_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
              <span className="truncate font-body text-[12px] font-semibold text-ink" title={d.groupLabel}>
                {d.groupLabel}
              </span>
              <GenderBar demo={d.demographics} te={te} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4">
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-green" aria-hidden /> {te.demoMale}
          </span>
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-red" aria-hidden /> {te.demoFemale}
          </span>
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-ink-faint/30" aria-hidden /> {te.demoUnknown}
          </span>
        </div>
      </div>

      {/* Age */}
      <div className="card mb-4 p-4">
        <h3 className="mb-3 font-display text-[14px] font-semibold text-ink">{te.demoAgeTitle}</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Event
                </th>
                {demographics.length > 0 &&
                  demographics[0].demographics.ageBrackets.map((b) => (
                    <th key={b.label} className="px-3 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      {b.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {demographics.map((d, ri) => (
                <tr key={d.groupKey} className={ri < demographics.length - 1 ? "border-b border-surface-border/50" : ""}>
                  <td className="px-3 py-2 font-body text-[12px] font-semibold text-ink">{d.groupLabel}</td>
                  {d.demographics.ageBrackets.map((b) => {
                    const pct = d.demographics.total > 0 ? Math.round((b.count / d.demographics.total) * 100) : 0;
                    return (
                      <td key={b.label} className="px-3 py-2 text-center">
                        {b.count > 0 ? (
                          <span
                            className="inline-block rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                            style={{
                              backgroundColor: pct > 20 ? "color-mix(in srgb, var(--green) 25%, transparent)" : pct > 10 ? "color-mix(in srgb, var(--amber) 20%, transparent)" : undefined,
                              color: pct > 20 ? "var(--green)" : pct > 10 ? "var(--amber)" : "var(--ink-soft)",
                            }}
                            title={`${b.count} (${pct}%)`}
                          >
                            {formatCount(b.count, lang)}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-ink-faint">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {demographics.length > 1 && (
                <tr className="border-t border-surface-border bg-surface-2/50">
                  <td className="px-3 py-2 font-display text-[11px] font-bold uppercase text-ink-faint">Total</td>
                  {ageTotals.map((count, i) => (
                    <td key={i} className="px-3 py-2 text-center font-mono text-[11px] font-bold text-ink-soft">
                      {count > 0 ? formatCount(count, lang) : "—"}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cities */}
      {sortedCities.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 font-display text-[14px] font-semibold text-ink">{te.demoCityTitle}</h3>
          <div className="space-y-1.5">
            {sortedCities.map(([city, count]) => (
              <div key={city} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 sm:grid-cols-[12rem_1fr_4rem]">
                <span className="truncate font-body text-[12px] font-semibold text-ink">{city}</span>
                <div className="h-4 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-green/60"
                    style={{ width: `${(count / maxCityCount) * 100}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[11px] tabular-nums text-ink-faint">
                  {formatCount(count, lang)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Comparison Section ── */

function ComparisonSection({
  comparison: c,
  lang,
  te,
  loading,
}: {
  comparison: EventComparison;
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  const delta = (a: number, b: number) => {
    if (a === 0 && b === 0) return { pct: 0, direction: "equal" as const };
    if (a === 0) return { pct: 100, direction: "up" as const };
    const d = Math.round(((b - a) / a) * 1000) / 10;
    return { pct: Math.abs(d), direction: d > 0 ? "up" as const : d < 0 ? "down" as const : "equal" as const };
  };

  const rows = [
    { label: te.compareTotal, a: c.eventA.total, b: c.eventB.total },
    { label: te.compareNew, a: c.eventA.newCount, b: c.eventB.newCount },
    { label: te.compareReturning, a: c.eventA.returning, b: c.eventB.returning },
  ];

  function DemoCompare({ dA, dB, label }: { dA: DemographicBreakdown; dB: DemographicBreakdown; label: string }) {
    return (
      <div>
        <h4 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
          {label}
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 font-body text-[11px] text-ink-faint">{c.eventA.label}</p>
            <GenderBar demo={dA} te={te} />
          </div>
          <div>
            <p className="mb-1 font-body text-[11px] text-ink-faint">{c.eventB.label}</p>
            <GenderBar demo={dB} te={te} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className={`transition-opacity ${loading ? "pointer-events-none opacity-50" : ""}`}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.compareTitle}</h2>

      {/* Side-by-side KPIs */}
      <div className="card mb-4 overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint" />
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink">
                {c.eventA.label}
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink">
                {c.eventB.label}
              </th>
              <th className="px-4 py-3 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.compareDelta}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = delta(r.a, r.b);
              return (
                <tr key={r.label} className="border-b border-surface-border/50">
                  <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">{r.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                    {formatCount(r.a, lang)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                    {formatCount(r.b, lang)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-0.5 font-mono text-[12px] font-semibold ${d.direction === "up" ? "text-green" : d.direction === "down" ? "text-red" : "text-ink-faint"}`}>
                      {d.direction === "up" && <ArrowUpRight className="h-3.5 w-3.5" />}
                      {d.direction === "down" && <ArrowDownRight className="h-3.5 w-3.5" />}
                      {d.direction === "equal" && <Equal className="h-3.5 w-3.5" />}
                      {d.pct > 0 ? `${d.direction === "up" ? "+" : "-"}${formatPct(d.pct, lang)}` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Overlap */}
      <div className="card mb-4 p-4">
        <h3 className="mb-3 font-display text-[14px] font-semibold text-ink">{te.compareOverlap}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-surface-border p-3 text-center">
            <div className="font-display text-[24px] font-semibold tabular-nums text-green">
              {formatCount(c.overlap, lang)}
            </div>
            <p className="mt-1 font-body text-[11px] text-ink-soft">
              {te.compareBothAttended.replace("{n}", formatCount(c.overlap, lang))}
            </p>
          </div>
          <div className="rounded-sm border border-surface-border p-3 text-center">
            <div className="font-display text-[24px] font-semibold tabular-nums text-ink">
              {formatCount(c.onlyA, lang)}
            </div>
            <p className="mt-1 font-body text-[11px] text-ink-soft">
              {te.compareOnlyA.replace("{n}", formatCount(c.onlyA, lang)).replace("{label}", c.eventA.label)}
            </p>
          </div>
          <div className="rounded-sm border border-surface-border p-3 text-center">
            <div className="font-display text-[24px] font-semibold tabular-nums text-ink">
              {formatCount(c.onlyB, lang)}
            </div>
            <p className="mt-1 font-body text-[11px] text-ink-soft">
              {te.compareOnlyB.replace("{n}", formatCount(c.onlyB, lang)).replace("{label}", c.eventB.label)}
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-1 font-body text-[12px] text-ink-soft">
          <p>{te.compareOverlapPct.replace("{pct}", formatPct(c.overlapPctA, lang)).replace("{label}", c.eventA.label).replace("{other}", c.eventB.label)}</p>
          <p>{te.compareOverlapPct.replace("{pct}", formatPct(c.overlapPctB, lang)).replace("{label}", c.eventB.label).replace("{other}", c.eventA.label)}</p>
        </div>
      </div>

      {/* Demographic comparison */}
      <div className="card space-y-4 p-4">
        <DemoCompare dA={c.demographicsA} dB={c.demographicsB} label={te.compareDemoGender} />

        <div>
          <h4 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            {te.compareDemoAge}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {[{ d: c.demographicsA, label: c.eventA.label }, { d: c.demographicsB, label: c.eventB.label }].map((side) => (
              <div key={side.label}>
                <p className="mb-1 font-body text-[11px] text-ink-faint">{side.label}</p>
                <div className="space-y-1">
                  {side.d.ageBrackets.filter((b) => b.count > 0).map((b) => {
                    const pct = side.d.total > 0 ? Math.round((b.count / side.d.total) * 100) : 0;
                    return (
                      <div key={b.label} className="flex items-center gap-2">
                        <span className="w-12 font-mono text-[10px] text-ink-faint">{b.label}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <span className="block h-full rounded-full bg-amber/60" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-[10px] text-ink-faint">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            {te.compareDemoCities}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {[{ d: c.demographicsA, label: c.eventA.label }, { d: c.demographicsB, label: c.eventB.label }].map((side) => (
              <div key={side.label}>
                <p className="mb-1 font-body text-[11px] text-ink-faint">{side.label}</p>
                <div className="space-y-0.5">
                  {side.d.topCities.slice(0, 5).map((ct) => (
                    <div key={ct.city} className="flex justify-between font-body text-[11px]">
                      <span className="truncate text-ink">{ct.city}</span>
                      <span className="ml-2 tabular-nums text-ink-faint">{formatCount(ct.count, lang)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── A: Lifecycle Funnel ── */

const FUNNEL_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  new: { bg: "bg-blue/10", text: "text-blue", bar: "bg-blue" },
  returning: { bg: "bg-green/10", text: "text-green", bar: "bg-green" },
  loyal: { bg: "bg-amber/10", text: "text-amber", bar: "bg-amber" },
  churned: { bg: "bg-red/10", text: "text-red", bar: "bg-red" },
};

function FunnelSection({
  funnel,
  lang,
  te,
  loading,
}: {
  funnel: LifecycleFunnel;
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  const total = funnel.stages.reduce((s, st) => s + (st.key === "churned" ? 0 : st.count), 0);
  const labelMap: Record<string, { name: string; desc: string }> = {
    new: { name: te.funnelNew, desc: te.funnelNewDesc },
    returning: { name: te.funnelReturning, desc: te.funnelReturningDesc },
    loyal: { name: te.funnelLoyal, desc: te.funnelLoyalDesc },
    churned: { name: te.funnelChurned, desc: te.funnelChurnedDesc },
  };

  const mainStages = funnel.stages.filter((s) => s.key !== "churned");
  const churnedStage = funnel.stages.find((s) => s.key === "churned");

  return (
    <section className={loading ? "pointer-events-none opacity-50" : ""}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.funnelTitle}</h2>
      <div className="card p-4">
        {/* Horizontal funnel bars */}
        <div className="space-y-3">
          {mainStages.map((stage, i) => {
            const colors = FUNNEL_COLORS[stage.key];
            const widthPct = total > 0 ? Math.max((stage.count / total) * 100, 4) : 0;
            const conv = funnel.conversions[i];
            return (
              <div key={stage.key}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className={`font-display text-[13px] font-semibold ${colors.text}`}>
                    {labelMap[stage.key].name}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-ink-faint">
                    {formatCount(stage.count, lang)} ({formatPct(stage.pct, lang)})
                  </span>
                </div>
                <div className="flex h-7 items-center overflow-hidden rounded-md bg-surface-2">
                  <span
                    className={`flex h-full items-center rounded-md px-2 font-mono text-[11px] font-bold text-white ${colors.bar}`}
                    style={{ width: `${widthPct}%`, minWidth: "2rem" }}
                  >
                    {stage.pct >= 10 ? formatPct(stage.pct, lang) : ""}
                  </span>
                </div>
                <p className="mt-0.5 font-body text-[11px] text-ink-faint">{labelMap[stage.key].desc}</p>
                {conv && (
                  <p className="mt-1 font-body text-[11px] font-semibold text-ink-soft">
                    → {te.funnelConversion.replace("{pct}", String(conv.rate))}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Churned indicator */}
        {churnedStage && churnedStage.count > 0 && (
          <div className="mt-4 rounded-md border border-red/20 bg-red/5 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[13px] font-semibold text-red">
                {labelMap.churned.name}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-red">
                {formatCount(churnedStage.count, lang)} ({formatPct(churnedStage.pct, lang)})
              </span>
            </div>
            <p className="mt-0.5 font-body text-[11px] text-ink-faint">{labelMap.churned.desc}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── B: Category Growth ── */

function CategoryGrowthSection({
  rows,
  lang,
  te,
  loading,
}: {
  rows: CategoryGrowthRow[];
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  return (
    <section className={loading ? "pointer-events-none opacity-50" : ""}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
        <TrendingUp className="mr-1.5 inline h-5 w-5 text-green" aria-hidden />
        {te.categoryGrowthTitle}
      </h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Event
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Total
              </th>
              <th className="px-4 py-3 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.compareDelta}
              </th>
              <th className="w-1/3 px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.groupKey} className={i < rows.length - 1 ? "border-b border-surface-border/50" : ""}>
                <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">{r.groupLabel}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                  {formatCount(r.total, lang)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {r.growthPct != null ? (
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                        r.growthPct > 0
                          ? "bg-green/10 text-green"
                          : r.growthPct < 0
                            ? "bg-red/10 text-red"
                            : "bg-ink-faint/10 text-ink-faint"
                      }`}
                    >
                      {r.growthPct > 0 && <ArrowUpRight className="h-3 w-3" />}
                      {r.growthPct < 0 && <ArrowDownRight className="h-3 w-3" />}
                      {r.growthPct > 0 ? `+${r.growthPct}%` : `${r.growthPct}%`}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 font-body text-[11px] text-ink-faint">
                      {te.categoryGrowthFirst}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="h-4 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-green/60"
                      style={{ width: `${(r.total / maxTotal) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── C: Overlap Matrix ── */

function overlapCellBg(pct: number): string | undefined {
  if (pct === 0) return undefined;
  if (pct >= 100) return "color-mix(in srgb, var(--green) 20%, transparent)";
  if (pct >= 30) return `color-mix(in srgb, var(--green) ${Math.round((pct / 100) * 40)}%, transparent)`;
  if (pct >= 10) return `color-mix(in srgb, var(--amber) ${Math.round((pct / 30) * 25 + 5)}%, transparent)`;
  return `color-mix(in srgb, var(--red) ${Math.max(Math.round((pct / 10) * 20), 5)}%, transparent)`;
}

function OverlapSection({
  matrix,
  lang,
  te,
  loading,
}: {
  matrix: OverlapMatrix;
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  const n = matrix.groupKeys.length;

  return (
    <section className={loading ? "pointer-events-none opacity-50" : ""}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">{te.overlapTitle}</h2>
      <div className="card p-4">
        <p className="mb-3 font-body text-[13px] text-ink-soft">{te.overlapDesc}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="sticky left-0 z-10 min-w-[8rem] bg-surface px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint" />
                {matrix.groupLabels.map((label, j) => (
                  <th
                    key={j}
                    className="px-3 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint"
                    title={label}
                  >
                    <span className="inline-block max-w-[5rem] truncate">{label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.groupLabels.map((label, i) => (
                <tr key={i} className={i < n - 1 ? "border-b border-surface-border/50" : ""}>
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-body text-[12px] font-semibold text-ink">
                    {label}
                  </td>
                  {matrix.cells[i].map((count, j) => {
                    const pct = matrix.pcts[i][j];
                    const isDialogal = i === j;
                    return (
                      <td key={j} className="px-3 py-2 text-center">
                        <span
                          className={`inline-block cursor-default rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold ${isDialogal ? "text-ink-faint" : ""}`}
                          style={{
                            backgroundColor: isDialogal ? undefined : overlapCellBg(pct),
                            color: isDialogal ? undefined : pct >= 30 ? "var(--green)" : pct >= 10 ? "var(--amber)" : pct > 0 ? "var(--red)" : "var(--ink-faint)",
                          }}
                          title={isDialogal ? `${count}` : te.overlapPeople.replace("{n}", String(count)) + ` (${formatPct(pct, lang)})`}
                        >
                          {isDialogal ? formatCount(count, lang) : pct > 0 ? formatPct(pct, lang) : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 font-body text-[11px] text-ink-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-red/20" aria-hidden /> &lt;10%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-amber/25" aria-hidden /> 10–30%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-green/30" aria-hidden /> &gt;30%
          </span>
        </div>
      </div>
    </section>
  );
}

/* ── D: Revenue Section ── */

function formatIdr(value: number, lang: Lang): string {
  return `Rp ${formatCount(value, lang)}`;
}

function RevenueSection({
  revenue,
  lang,
  te,
  loading,
}: {
  revenue: RevenueAnalysis;
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  return (
    <section className={loading ? "pointer-events-none opacity-50" : ""}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
        <DollarSign className="mr-1.5 inline h-5 w-5 text-green" aria-hidden />
        {te.revenueTitle}
      </h2>

      {/* Overall KPIs */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard value={formatIdr(revenue.overallTotal, lang)} label={te.revenueTotal} tone="green" />
        <KpiCard value={formatIdr(revenue.overallAvg, lang)} label={te.revenueAvg} tone="green" />
        <KpiCard value={formatIdr(revenue.overallMedian, lang)} label={te.revenueMedian} tone="green" />
      </div>

      {/* Per-group table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Event
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.revenueTotal}
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.revenueAvg}
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.revenueMedian}
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.revenueNew}
              </th>
              <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {te.revenueReturning}
              </th>
            </tr>
          </thead>
          <tbody>
            {revenue.groups.map((g, i) => (
              <tr key={g.groupKey} className={i < revenue.groups.length - 1 ? "border-b border-surface-border/50" : ""}>
                <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">{g.groupLabel}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                  {g.totalRevenue > 0 ? formatIdr(g.totalRevenue, lang) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-soft">
                  {g.avgRevenue > 0 ? formatIdr(g.avgRevenue, lang) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-soft">
                  {g.medianRevenue > 0 ? formatIdr(g.medianRevenue, lang) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-soft">
                  {g.newRevenue > 0 ? formatIdr(g.newRevenue, lang) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-green">
                  {g.returningRevenue > 0 ? formatIdr(g.returningRevenue, lang) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-body text-[11px] text-ink-faint">
        {te.revenuePeople.replace("{n}", formatCount(revenue.groups.reduce((s, g) => s + g.count, 0), lang))}
      </p>
    </section>
  );
}

/* ── E: Geographic Expansion ── */

function GeoExpansionSection({
  geo,
  lang,
  te,
  loading,
}: {
  geo: GeoExpansion;
  lang: Lang;
  te: Te;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <section className={loading ? "pointer-events-none opacity-50" : ""}>
      <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
        <MapPin className="mr-1.5 inline h-5 w-5 text-green" aria-hidden />
        {te.geoTitle}
      </h2>
      <div className="card p-4">
        <p className="mb-3 font-body text-[13px] text-ink-soft">{te.geoDesc}</p>
        <div className="space-y-4">
          {geo.groups.map((g) => {
            const isOpen = expanded[g.groupKey] ?? (geo.groups.length <= 4);
            const maxCount = g.topCities.length > 0 ? Math.max(...g.topCities.map((c) => c.count)) : 1;
            const activeCities = g.topCities.filter((c) => c.badge !== "lost");

            return (
              <div key={g.groupKey} className="rounded-lg border border-surface-border">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [g.groupKey]: !isOpen }))}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="font-display text-[13px] font-semibold text-ink">{g.groupLabel}</span>
                  <div className="flex items-center gap-3">
                    {g.concentrationTop1Pct >= 50 && (
                      <span className="rounded-full bg-amber/10 px-2 py-0.5 font-body text-[10px] font-semibold text-amber">
                        {te.geoHighConcentration}
                      </span>
                    )}
                    <span className="font-body text-[11px] text-ink-faint">
                      {te.geoTop1.replace("{pct}", String(g.concentrationTop1Pct))}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-ink-faint" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-surface-border/50 px-4 py-3">
                    <div className="mb-2 flex gap-4 font-body text-[11px] text-ink-faint">
                      <span>{te.geoTop1.replace("{pct}", String(g.concentrationTop1Pct))}</span>
                      <span>{te.geoTop3.replace("{pct}", String(g.concentrationTop3Pct))}</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeCities.map((c) => (
                        <div
                          key={c.city}
                          className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 sm:grid-cols-[12rem_1fr_auto]"
                        >
                          <span className="flex items-center gap-1.5 truncate font-body text-[12px] font-semibold text-ink">
                            {c.city}
                            {c.badge === "new" && (
                              <span className="rounded bg-green/15 px-1 py-0.5 font-mono text-[9px] font-bold text-green">
                                {te.geoNew}
                              </span>
                            )}
                          </span>
                          <div className="h-4 overflow-hidden rounded-full bg-surface-2">
                            <span
                              className="block h-full rounded-full bg-green/60"
                              style={{ width: `${(c.count / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="text-right font-mono text-[11px] tabular-nums text-ink-faint">
                            {formatCount(c.count, lang)}
                          </span>
                        </div>
                      ))}
                      {g.topCities.filter((c) => c.badge === "lost").map((c) => (
                        <div
                          key={`lost-${c.city}`}
                          className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 opacity-50 sm:grid-cols-[12rem_1fr_auto]"
                        >
                          <span className="flex items-center gap-1.5 truncate font-body text-[12px] text-ink-faint line-through">
                            {c.city}
                            <span className="rounded bg-red/15 px-1 py-0.5 font-mono text-[9px] font-bold text-red no-underline">
                              {te.geoLost}
                            </span>
                          </span>
                          <div />
                          <span />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
