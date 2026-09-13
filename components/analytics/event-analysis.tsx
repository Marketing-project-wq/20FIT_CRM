"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Printer, RefreshCw, ChevronDown, ChevronRight, TrendingDown, X, Search, Check, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventAnalyticsData, EventGroup } from "@/lib/crm/event-analytics";
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
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
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

      {/* Insight Box */}
      <InsightBox data={data} lang={lang} te={te} />

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

      {/* Expandable sections */}
      <ExpandableSection title={te.recsTitle} defaultOpen={false}>
        <Recommendations data={data} te={te} lang={lang} />
      </ExpandableSection>

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

function InsightBox({ data, lang, te }: { data: EventAnalyticsData; lang: Lang; te: Te }) {
  if (data.cohort.length < 2) return null;

  const insights: string[] = [];
  const first = data.cohort[0];
  const second = data.cohort[1];

  if (first.retention.length > 0 && second.retention.length > 0) {
    const firstRet = first.retention[0];
    const secondRet = second.retention[0];
    if (secondRet < firstRet) {
      insights.push(
        te.insightWeakening
          .replace("{a}", first.cohortLabel)
          .replace("{pctA}", formatPct(firstRet, lang))
          .replace("{b}", second.cohortLabel)
          .replace("{pctB}", formatPct(secondRet, lang)),
      );
    } else if (secondRet > firstRet) {
      insights.push(
        te.insightStrengthening
          .replace("{pctA}", formatPct(firstRet, lang))
          .replace("{b}", second.cohortLabel)
          .replace("{pctB}", formatPct(secondRet, lang)),
      );
    }
  }

  if (data.churn.length > 0) {
    const worst = data.churn.reduce((a, b) => (a.notReturnedPct > b.notReturnedPct ? a : b));
    if (worst.notReturnedPct > 80) {
      insights.push(
        te.insightHighChurn
          .replace("{label}", worst.label)
          .replace("{pct}", formatPct(worst.notReturnedPct, lang)),
      );
    }
  }

  if (insights.length === 0) return null;

  return (
    <section className="tint-amber rounded-card px-5 py-4">
      <div className="space-y-1.5">
        {insights.map((text, i) => (
          <p key={i} className="font-body text-[13px] leading-relaxed text-ink">
            {text}
          </p>
        ))}
      </div>
    </section>
  );
}

function Recommendations({
  data,
  te,
  lang,
}: {
  data: EventAnalyticsData;
  te: Te;
  lang: Lang;
}) {
  const recs: string[] = [];

  if (data.returningPct < 15) {
    recs.push(te.recLowReturn.replace("{pct}", formatPct(data.returningPct, lang)));
  }

  if (data.skipAfterOneReturn > 0) {
    recs.push(te.recSkipReturn.replace("{n}", formatCount(data.skipAfterOneReturn, lang)));
  }

  if (data.churn.length > 0) {
    const worstChurn = data.churn.reduce((a, b) =>
      a.notReturnedPct > b.notReturnedPct ? a : b,
    );
    recs.push(
      te.recHighChurn
        .replace("{label}", worstChurn.label)
        .replace("{pct}", formatPct(worstChurn.notReturnedPct, lang)),
    );
  }

  if (recs.length === 0) {
    recs.push(te.recNoData);
  }

  return (
    <ul className="list-disc space-y-2 pl-5 font-body text-[13px] text-ink-soft">
      {recs.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
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
