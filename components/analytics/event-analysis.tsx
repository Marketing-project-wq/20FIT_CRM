"use client";

import { useState } from "react";
import { Printer, RefreshCw, ChevronDown, ChevronRight, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventAnalyticsData, EventGroup } from "@/lib/crm/event-analytics";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct, type Lang } from "@/lib/i18n";

const DEFAULT_ROWS = 10;

export function EventAnalysis({ data, nowMs }: { data: EventAnalyticsData; nowMs: number }) {
  const { lang } = useI18n() as { lang: Lang };
  const [viewMode, setViewMode] = useState<"groups" | "all">("groups");
  const [showAllRows, setShowAllRows] = useState(false);
  const isId = lang === "id";

  const displayItems = viewMode === "groups"
    ? data.groups.map((g) => ({ key: g.groupKey, label: g.groupLabel, total: g.total, newCount: g.newCount, returning: g.returning, subCount: g.subEvents.length }))
    : data.events.map((e) => ({ key: e.slug, label: e.label, total: e.total, newCount: e.newCount, returning: e.returning, subCount: 1 }));

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
            {isId ? "Analisa Event" : "Event Analysis"}
          </h1>
          <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">
            {isId
              ? "Ringkasan event + retensi & nilai dalam satu halaman."
              : "Event summary + retention & value on one page."}
          </p>
          <p className="mt-1 font-mono text-[11px] text-ink-faint">
            {isId ? "Dihitung" : "Computed"} {new Date(nowMs).toLocaleString(lang === "id" ? "id-ID" : "en-US")}
            {" · "}{data.groups.length} {isId ? "grup" : "groups"}, {data.events.length} {isId ? "sub-event" : "sub-events"}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden />
            {isId ? "Cetak / PDF" : "Print / PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <span className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
          {isId ? "Tampilan" : "View"}
        </span>
        <div className="inline-flex overflow-hidden rounded-sm border border-glass-border">
          <button
            type="button"
            onClick={() => { setViewMode("groups"); setShowAllRows(false); }}
            className={`px-3 py-1.5 font-body text-[13px] transition-colors ${
              viewMode === "groups"
                ? "bg-ink text-white"
                : "bg-glass text-ink hover:bg-surface-border"
            }`}
          >
            {isId ? "Event utama" : "Grouped"} ({data.groups.length})
          </button>
          <button
            type="button"
            onClick={() => { setViewMode("all"); setShowAllRows(false); }}
            className={`border-l border-glass-border px-3 py-1.5 font-body text-[13px] transition-colors ${
              viewMode === "all"
                ? "bg-ink text-white"
                : "bg-glass text-ink hover:bg-surface-border"
            }`}
          >
            {isId ? "Semua event" : "All events"} ({data.events.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
          {isId ? "Jawaban singkat" : "Quick answers"}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            value={formatCount(data.totalPeople, lang)}
            label={isId ? "orang pernah ikut event 20FIT" : "people attended a 20FIT event"}
            tone="green"
          />
          <KpiCard
            value={`${formatCount(data.returningPeople, lang)} (${formatPct(data.returningPct, lang)})`}
            label={isId ? "kembali di event lain" : "returned at another event"}
            tone="green"
          />
          <KpiCard
            value={data.frequentPeople > 0
              ? formatCount(data.frequentPeople, lang)
              : `${data.avgGroupsPerPerson}`
            }
            label={data.frequentPeople > 0
              ? (isId ? `ikut ≥3 event · rata-rata ${data.avgGroupsPerPerson} event/orang` : `attended ≥3 events · avg ${data.avgGroupsPerPerson} events/person`)
              : (isId ? "rata-rata event per orang" : "avg events per person")
            }
            tone={data.frequentPeople > 0 ? "green" : "amber"}
          />
        </div>
      </section>

      {/* Attendance Table */}
      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
          {isId ? "Berapa yang datang" : "Attendance"}
        </h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {viewMode === "groups" ? "Event" : (isId ? "Sub-event" : "Sub-event")}
                </th>
                {viewMode === "groups" && (
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {isId ? "Varian" : "Variants"}
                  </th>
                )}
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Total</th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{isId ? "Baru" : "New"}</th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{isId ? "Kembali" : "Returning"}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ev, i) => (
                <AttendanceRow
                  key={ev.key}
                  item={ev}
                  group={viewMode === "groups" ? data.groups.find((g) => g.groupKey === ev.key) : undefined}
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
              ? (isId ? `Tampilkan ${DEFAULT_ROWS} teratas` : `Show top ${DEFAULT_ROWS}`)
              : (isId ? `Tampilkan semua (${sorted.length})` : `Show all (${sorted.length})`)
            }
          </button>
        )}

        {/* Horizontal stacked bars */}
        <div className="mt-4 space-y-2">
          {visible.map((ev) => (
            <div key={ev.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 sm:grid-cols-[10rem_1fr_auto]">
              <span className="truncate font-body text-[12px] font-semibold text-ink" title={ev.label}>{ev.label}</span>
              <div className="flex h-4 overflow-hidden rounded-full bg-surface-border">
                {ev.returning > 0 && (
                  <span
                    className="block h-full bg-green"
                    style={{ width: `${(ev.returning / maxTotal) * 100}%` }}
                    title={`${isId ? "Kembali" : "Returning"}: ${ev.returning}`}
                  />
                )}
                <span
                  className="block h-full bg-surface-border"
                  style={{ width: `${(ev.newCount / maxTotal) * 100}%` }}
                  title={`${isId ? "Baru" : "New"}: ${ev.newCount}`}
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
            <span className="inline-block h-3 w-3 rounded-sm bg-green" aria-hidden /> {isId ? "Kembali" : "Returning"}
          </span>
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-surface-border" aria-hidden /> {isId ? "Baru" : "New"}
          </span>
        </div>
      </section>

      {/* Cohort Retention */}
      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
          {isId ? "Apakah mereka balik" : "Did they return"}
        </h2>
        <div className="card p-4">
          <p className="mb-3 font-body text-[13px] text-ink-soft">
            {isId
              ? `Kohort retensi per grup event — dari peserta yang event pertamanya di baris ini, berapa persen muncul lagi di event berikutnya.`
              : `Retention cohort by event group — of attendees whose first event is this row, what percent appeared at the next events.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="sticky left-0 z-10 min-w-[8rem] bg-white px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:bg-[var(--card-bg,#1a1a1a)]">
                    {isId ? "Event pertama" : "First event"}
                  </th>
                  <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {isId ? "Orang" : "People"}
                  </th>
                  {data.groups.slice(1).map((g, i) => (
                    <th key={i} className="px-3 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint" title={g.groupLabel}>
                      +{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohort.map((row, ri) => (
                  <tr key={row.cohortEvent} className={ri < data.cohort.length - 1 ? "border-b border-surface-border/50" : ""}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-body text-[13px] font-semibold text-ink dark:bg-[var(--card-bg,#1a1a1a)]">
                      {row.cohortLabel}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(row.cohortSize, lang)}</td>
                    {data.groups.slice(1).map((g, i) => {
                      if (i >= row.retention.length) return <td key={i} className="px-3 py-2" />;
                      const pct = row.retention[i];
                      const abs = row.retentionAbs[i];
                      const tooltip = `${abs} ${isId ? "dari" : "of"} ${row.cohortSize} ${isId ? "peserta" : "attendees"} ${row.cohortLabel} ${isId ? "juga ikut" : "also attended"} ${g.groupLabel} (${formatPct(pct, lang)})`;
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
                            {pct > 0 ? formatPct(pct, lang) : <span className="text-ink-faint">&mdash;</span>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Color legend */}
          <div className="mt-3 flex flex-wrap gap-3 font-body text-[11px] text-ink-faint">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.25)" }} aria-hidden /> 0–5%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(245, 158, 11, 0.3)" }} aria-hidden /> 5–15%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "rgba(28, 138, 75, 0.35)" }} aria-hidden /> &gt;15%
            </span>
          </div>
        </div>
      </section>

      {/* Insight Box */}
      <InsightBox data={data} lang={lang} isId={isId} />

      {/* Churn */}
      {data.churn.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
            <TrendingDown className="mr-1.5 inline h-5 w-5 text-red" aria-hidden />
            {isId ? "Siapa yang tidak kembali" : "Who did not return"}
          </h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Event</th>
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Total</th>
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{isId ? "Tidak kembali" : "Not returned"}</th>
                  <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">%</th>
                </tr>
              </thead>
              <tbody>
                {data.churn.map((row, i) => (
                  <tr key={row.event} className={i < data.churn.length - 1 ? "border-b border-surface-border/50" : ""}>
                    <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">{row.label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(row.total, lang)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-red">{formatCount(row.notReturned, lang)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink-soft">{formatPct(row.notReturnedPct, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.skipAfterOneReturn > 0 && (
            <p className="mt-3 font-body text-[13px] text-ink-soft">
              {isId
                ? `Sisi baiknya: ${formatCount(data.skipAfterOneReturn, lang)} orang kembali setelah melewatkan satu event — reaktivasi mungkin dilakukan.`
                : `On the bright side: ${formatCount(data.skipAfterOneReturn, lang)} people returned after skipping an event — reactivation is possible.`
              }
            </p>
          )}
        </section>
      )}

      {/* Expandable sections */}
      <ExpandableSection title={isId ? "Apa yang harus dilakukan" : "What to do"} defaultOpen={false}>
        <Recommendations data={data} isId={isId} lang={lang} />
      </ExpandableSection>

      <ExpandableSection title={isId ? "Catatan Data" : "Data Notes"} defaultOpen={false}>
        <div className="space-y-2 font-body text-[13px] text-ink-soft">
          <p>
            {isId
              ? "Sumber data digabung dari dua sumber per orang (customer_id): (1) customer_engagement WHERE unit='event' dan (2) tag event:* di master_customer.tags[]."
              : "Data merged from two per-person sources (by customer_id): (1) customer_engagement WHERE unit='event' and (2) event:* tags in master_customer.tags[]."}
          </p>
          <p>
            {isId
              ? `Sub-event terkait (JHM 5K/10K/HM, dll.) dikelompokkan otomatis berdasarkan prefix slug. Semua KPI, kohort, dan churn dihitung per grup (${data.groups.length} grup dari ${data.events.length} sub-event).`
              : `Related sub-events (JHM 5K/10K/HM, etc.) are auto-grouped by slug prefix. All KPIs, cohort, and churn are computed per group (${data.groups.length} groups from ${data.events.length} sub-events).`}
          </p>
          <p>
            {isId
              ? "Urutan kronologis dari first_seen_at (customer_engagement). Angka &quot;Baru&quot; = event pertama seseorang, &quot;Kembali&quot; = event berikutnya."
              : "Chronological order from first_seen_at (customer_engagement). \"New\" = a person's first event, \"Returning\" = subsequent events."}
          </p>
        </div>
      </ExpandableSection>
    </div>
  );
}

function AttendanceRow({ item, group, isLast, isFirst, showVariants, lang }: {
  item: { key: string; label: string; total: number; newCount: number; returning: number; subCount: number };
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
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
              }
              {item.label}
            </button>
          ) : item.label}
        </td>
        {showVariants && (
          <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-faint">
            {item.subCount > 1 ? item.subCount : ""}
          </td>
        )}
        <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(item.total, lang)}</td>
        <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(item.newCount, lang)}</td>
        <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
          {isFirst && item.returning === 0
            ? <span className="text-ink-faint">&mdash;</span>
            : <span className="font-semibold text-green">{formatCount(item.returning, lang)}</span>
          }
        </td>
      </tr>
      {expanded && hasSubEvents && group.subEvents.map((sub, si) => (
        <tr key={sub.slug} className={si < group.subEvents.length - 1 ? "border-b border-surface-border/30" : (isLast ? "" : "border-b border-surface-border/50")}>
          <td className="py-1.5 pl-10 pr-4 font-body text-[12px] text-ink-soft">{sub.label}</td>
          {showVariants && <td />}
          <td colSpan={3} />
        </tr>
      ))}
    </>
  );
}

function KpiCard({ value, label, tone }: { value: string; label: string; tone: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "text-red";
  return (
    <div className="card p-5">
      <div className={`font-display text-[28px] font-semibold leading-none tabular-nums ${color}`}>{value}</div>
      <div className="mt-1.5 font-body text-[12px] text-ink-soft">{label}</div>
    </div>
  );
}

function cohortCellBg(pct: number): string | undefined {
  if (pct === 0) return undefined;
  if (pct <= 5) return `rgba(239, 68, 68, ${Math.max(pct / 5 * 0.3, 0.08)})`;
  if (pct <= 15) return `rgba(245, 158, 11, ${Math.max((pct - 5) / 10 * 0.3 + 0.1, 0.1)})`;
  return `rgba(28, 138, 75, ${Math.max(pct / 100 * 0.6, 0.15)})`;
}

function cohortCellFg(pct: number): string {
  if (pct === 0) return "var(--ink-faint)";
  if (pct <= 5) return "var(--red)";
  if (pct <= 15) return "var(--amber, #b45309)";
  if (pct >= 50) return "white";
  return "var(--green)";
}

function InsightBox({ data, lang, isId }: { data: EventAnalyticsData; lang: Lang; isId: boolean }) {
  if (data.cohort.length < 2) return null;

  const insights: string[] = [];

  const first = data.cohort[0];
  const second = data.cohort[1];

  if (first.retention.length > 0 && second.retention.length > 0) {
    const firstRet = first.retention[0];
    const secondRet = second.retention[0];
    if (secondRet < firstRet) {
      insights.push(
        isId
          ? `Retensi melemah: ${first.cohortLabel} → ${formatPct(firstRet, lang)} kembali, ${second.cohortLabel} → ${formatPct(secondRet, lang)}.`
          : `Retention weakening: ${first.cohortLabel} → ${formatPct(firstRet, lang)} returned, ${second.cohortLabel} → ${formatPct(secondRet, lang)}.`
      );
    } else if (secondRet > firstRet) {
      insights.push(
        isId
          ? `Retensi menguat: ${second.cohortLabel} → ${formatPct(secondRet, lang)} kembali (naik dari ${formatPct(firstRet, lang)}).`
          : `Retention strengthening: ${second.cohortLabel} → ${formatPct(secondRet, lang)} returned (up from ${formatPct(firstRet, lang)}).`
      );
    }
  }

  if (data.churn.length > 0) {
    const worst = data.churn.reduce((a, b) => (a.notReturnedPct > b.notReturnedPct ? a : b));
    if (worst.notReturnedPct > 80) {
      insights.push(
        isId
          ? `Churn tertinggi: ${worst.label} (${formatPct(worst.notReturnedPct, lang)} tidak kembali).`
          : `Highest churn: ${worst.label} (${formatPct(worst.notReturnedPct, lang)} did not return).`
      );
    }
  }

  if (insights.length === 0) return null;

  return (
    <section className="tint-amber rounded-card px-5 py-4">
      <div className="space-y-1.5">
        {insights.map((text, i) => (
          <p key={i} className="font-body text-[13px] leading-relaxed text-ink">{text}</p>
        ))}
      </div>
    </section>
  );
}

function Recommendations({ data, isId, lang }: { data: EventAnalyticsData; isId: boolean; lang: Lang }) {
  const recs: string[] = [];

  if (data.returningPct < 15) {
    recs.push(
      isId
        ? `Hanya ${formatPct(data.returningPct, lang)} yang kembali. Pertimbangkan program follow-up pasca-event (email, WhatsApp).`
        : `Only ${formatPct(data.returningPct, lang)} returned. Consider post-event follow-up programs (email, WhatsApp).`
    );
  }

  if (data.skipAfterOneReturn > 0) {
    recs.push(
      isId
        ? `${formatCount(data.skipAfterOneReturn, lang)} orang melewatkan satu event lalu kembali — target segmen ini dengan penawaran khusus.`
        : `${formatCount(data.skipAfterOneReturn, lang)} people skipped an event then returned — target this segment with special offers.`
    );
  }

  if (data.churn.length > 0) {
    const worstChurn = data.churn.reduce((a, b) => (a.notReturnedPct > b.notReturnedPct ? a : b));
    recs.push(
      isId
        ? `${worstChurn.label} memiliki churn tertinggi (${formatPct(worstChurn.notReturnedPct, lang)}). Lakukan survey peserta yang tidak kembali.`
        : `${worstChurn.label} has the highest churn (${formatPct(worstChurn.notReturnedPct, lang)}). Survey attendees who did not return.`
    );
  }

  if (recs.length === 0) {
    recs.push(
      isId
        ? "Belum cukup data untuk rekomendasi spesifik. Tambahkan lebih banyak event untuk melihat tren."
        : "Not enough data for specific recommendations. Add more events to see trends."
    );
  }

  return (
    <ul className="list-disc space-y-2 pl-5 font-body text-[13px] text-ink-soft">
      {recs.map((r, i) => <li key={i}>{r}</li>)}
    </ul>
  );
}

function ExpandableSection({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-[16px] font-bold text-ink">{title}</span>
        {open
          ? <ChevronDown className="h-5 w-5 text-ink-faint" aria-hidden />
          : <ChevronRight className="h-5 w-5 text-ink-faint" aria-hidden />
        }
      </button>
      {open && <div className="border-t border-surface-border px-5 py-4">{children}</div>}
    </section>
  );
}
