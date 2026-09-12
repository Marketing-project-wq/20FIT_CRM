"use client";

import { useState } from "react";
import { Printer, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventAnalyticsData } from "@/lib/crm/event-analytics";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct, type Lang } from "@/lib/i18n";

export function EventAnalysis({ data, nowMs }: { data: EventAnalyticsData; nowMs: number }) {
  const { lang } = useI18n() as { lang: Lang };
  const [filterEvent, setFilterEvent] = useState("all");
  const isId = lang === "id";

  const filteredEvents = filterEvent === "all"
    ? data.events
    : data.events.filter((e) => e.slug === filterEvent);

  const maxTotal = Math.max(...data.events.map((e) => e.total), 1);

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

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <span className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Filter</span>
        <select
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
          className="h-9 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
        >
          <option value="all">{isId ? "Semua event" : "All events"}</option>
          {data.events.map((ev) => (
            <option key={ev.slug} value={ev.slug}>{ev.label}</option>
          ))}
        </select>
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
            value={formatCount(data.allEventsPeople, lang)}
            label={isId ? "ikut semua event" : "attended all events"}
            tone="green"
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
                <th className="px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Event</th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Total</th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{isId ? "Baru" : "New"}</th>
                <th className="px-4 py-3 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{isId ? "Kembali" : "Returning"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev, i) => (
                <tr key={ev.slug} className={i < filteredEvents.length - 1 ? "border-b border-surface-border/50" : ""}>
                  <td className="px-4 py-2.5 font-body text-[13px] font-semibold text-ink">{ev.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(ev.total, lang)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(ev.newCount, lang)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                    {i === 0 && ev.returning === 0
                      ? <span className="text-ink-faint">&mdash;</span>
                      : <span className="font-semibold text-green">{formatCount(ev.returning, lang)}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Horizontal stacked bars */}
        <div className="mt-4 space-y-3">
          {filteredEvents.map((ev) => (
            <div key={ev.slug} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 sm:grid-cols-[10rem_1fr_auto]">
              <span className="truncate font-body text-[12px] font-semibold text-ink" title={ev.label}>{ev.label}</span>
              <div className="flex h-5 overflow-hidden rounded-full bg-surface-border">
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
                {formatCount(ev.total, lang)} {isId ? "orang" : "people"}
                {ev.returning > 0 && ` · ${formatCount(ev.returning, lang)} ${isId ? "kembali" : "returning"}`}
              </span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex gap-4">
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-green" aria-hidden /> {isId ? "Kembali" : "Returning"}
          </span>
          <span className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft">
            <span className="inline-block h-3 w-3 rounded-sm bg-surface-border" aria-hidden /> {isId ? "Baru" : "New"}
          </span>
        </div>

        {data.events.length > 0 && data.events[0].returning === 0 && (
          <p className="mt-2 font-mono text-[11px] text-ink-faint">
            &mdash; {isId
              ? `di kolom Kembali pada ${data.events[0].label}: event pertama, tidak ada "event sebelumnya" untuk dibandingkan (batas data).`
              : `Returning is blank for ${data.events[0].label}: it is the first event — no prior event to compare against (data boundary).`
            }
          </p>
        )}
      </section>

      {/* Cohort Retention */}
      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
          {isId ? "Apakah mereka balik" : "Did they return"}
        </h2>
        <div className="card p-4">
          <p className="mb-3 font-body text-[13px] text-ink-soft">
            {isId
              ? "Kohort retensi — dari peserta yang event pertamanya di baris ini, berapa persen muncul lagi di event berikutnya."
              : "Retention cohort — of attendees whose first event is this row, what percent appeared at the next events."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {isId ? "Event pertama" : "First event"}
                  </th>
                  <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {isId ? "Orang event itu" : "People"}
                  </th>
                  {data.events.slice(1).map((_, i) => (
                    <th key={i} className="px-3 py-2 text-center font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      +{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohort.map((row, ri) => (
                  <tr key={row.cohortEvent} className={ri < data.cohort.length - 1 ? "border-b border-surface-border/50" : ""}>
                    <td className="px-3 py-2 font-body text-[13px] font-semibold text-ink">{row.cohortLabel}</td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-ink">{formatCount(row.cohortSize, lang)}</td>
                    {data.events.slice(1).map((_, i) => {
                      if (i >= row.retention.length) return <td key={i} className="px-3 py-2" />;
                      const pct = row.retention[i];
                      return (
                        <td key={i} className="px-3 py-2 text-center">
                          {i === -1 ? (
                            <span className="inline-block rounded-sm bg-green px-2 py-0.5 font-display text-[12px] font-bold text-white">100%</span>
                          ) : (
                            <span
                              className="inline-block rounded-sm px-2 py-0.5 font-display text-[12px] font-bold"
                              style={{
                                backgroundColor: pct > 0 ? `rgba(28, 138, 75, ${Math.max(pct / 100 * 0.6, 0.08)})` : undefined,
                                color: pct >= 50 ? "white" : pct > 0 ? "var(--green)" : "var(--ink-faint)",
                              }}
                            >
                              {pct > 0 ? formatPct(pct, lang) : <span className="text-ink-faint">&mdash;</span>}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Insight Box */}
      <InsightBox data={data} lang={lang} isId={isId} />

      {/* Churn */}
      <section>
        <h2 className="mb-3 font-display text-[16px] font-bold text-ink">
          <TrendingDown className="mr-1.5 inline h-5 w-5 text-red" aria-hidden />
          {isId ? "Sisi sebaliknya: berapa yang TIDAK kembali" : "The other side: who did NOT return"}
        </h2>
        <div className="card p-5">
          <div className="space-y-3">
            {data.churn.map((row) => (
              <p key={row.event} className="font-body text-[13px] leading-relaxed text-ink">
                <strong>{formatCount(row.notReturned, lang)}</strong> {isId ? "dari" : "of"}{" "}
                {formatCount(row.total, lang)} {isId ? "peserta" : "attendees"} {row.label}{" "}
                (<strong>{formatPct(row.notReturnedPct, lang)}</strong>) {isId ? "tidak kembali." : "did not return."}
              </p>
            ))}
          </div>
          {data.skipAfterOneReturn > 0 && (
            <p className="mt-4 font-body text-[13px] text-ink-soft">
              {isId
                ? `Sisi baiknya: ${formatCount(data.skipAfterOneReturn, lang)} orang kembali setelah melewatkan satu event — reaktivasi mungkin dilakukan.`
                : `On the bright side: ${formatCount(data.skipAfterOneReturn, lang)} people returned after skipping an event — reactivation is possible.`
              }
            </p>
          )}
        </div>
      </section>

      {/* Expandable sections */}
      <ExpandableSection
        title={isId ? "Berapa nilainya" : "What's the value"}
        defaultOpen={false}
      >
        <p className="font-body text-[13px] text-ink-soft">
          {isId
            ? "Data revenue per event belum tersedia. Jika lifetime_value atau data transaksi event tersedia di masa depan, bagian ini akan menampilkan estimasi nilai per event dan ROI retensi."
            : "Per-event revenue data is not yet available. When lifetime_value or event transaction data becomes available, this section will display per-event value estimates and retention ROI."
          }
        </p>
      </ExpandableSection>

      <ExpandableSection
        title={isId ? "Apa yang harus dilakukan" : "What to do"}
        defaultOpen={false}
      >
        <Recommendations data={data} isId={isId} lang={lang} />
      </ExpandableSection>

      <ExpandableSection
        title={isId ? "Catatan Data" : "Data Notes"}
        defaultOpen={false}
      >
        <div className="space-y-2 font-body text-[13px] text-ink-soft">
          <p>
            {isId
              ? "Sumber data digabung dari dua sumber per orang (customer_id): (1) customer_engagement WHERE unit='event' dan (2) tag event:* di master_customer.tags[]. Orang yang muncul di salah satu atau kedua sumber dihitung sekali per event."
              : "Data merged from two per-person sources (by customer_id): (1) customer_engagement WHERE unit='event' and (2) event:* tags in master_customer.tags[]. A person appearing in either or both sources is counted once per event."
            }
          </p>
          <p>
            {isId
              ? "Label event dari crm_tag_registry (prioritas), nama produk dari customer_engagement (fallback), atau format otomatis dari slug."
              : "Event labels from crm_tag_registry (priority), product name from customer_engagement (fallback), or auto-formatted from slug."
            }
          </p>
          <p>
            {isId
              ? "Urutan event berdasarkan first_seen_at dari customer_engagement (kronologis). Event tanpa data tanggal diurutkan berdasarkan slug."
              : "Event order uses first_seen_at from customer_engagement (chronological). Events without date data fall back to slug order."
            }
          </p>
          <p>
            {isId
              ? "Angka &quot;Baru&quot; dan &quot;Kembali&quot; dihitung berdasarkan urutan kronologis: event pertama seseorang = Baru, event berikutnya = Kembali."
              : "\"New\" and \"Returning\" are computed from chronological order: a person's first event = New, subsequent events = Returning."
            }
          </p>
        </div>
      </ExpandableSection>
    </div>
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

function InsightBox({ data, lang, isId }: { data: EventAnalyticsData; lang: Lang; isId: boolean }) {
  if (data.cohort.length < 2) return null;

  const insights: string[] = [];

  // Compare retention rates between first and second cohort
  const first = data.cohort[0];
  const second = data.cohort[1];

  if (first.retention.length > 0 && second.retention.length > 0) {
    const firstRet = first.retention[0];
    const secondRet = second.retention[0];

    if (secondRet < firstRet) {
      insights.push(
        isId
          ? `Retensi angkatan melemah: dari peserta yang event pertamanya ${first.cohortLabel}, ${formatPct(firstRet, lang)} kembali di event berikutnya; dari peserta ${second.cohortLabel}, ${formatPct(secondRet, lang)}.`
          : `Cohort retention is weakening: of attendees whose first event was ${first.cohortLabel}, ${formatPct(firstRet, lang)} returned; from ${second.cohortLabel}, ${formatPct(secondRet, lang)}.`
      );
    } else if (secondRet > firstRet) {
      insights.push(
        isId
          ? `Retensi angkatan menguat: dari peserta ${second.cohortLabel}, ${formatPct(secondRet, lang)} kembali (naik dari ${formatPct(firstRet, lang)} di ${first.cohortLabel}).`
          : `Cohort retention is strengthening: from ${second.cohortLabel} attendees, ${formatPct(secondRet, lang)} returned (up from ${formatPct(firstRet, lang)} at ${first.cohortLabel}).`
      );
    }
  }

  // Compare absolute returning vs percentage
  if (data.events.length >= 2) {
    const lastTwo = data.events.slice(-2);
    const prev = lastTwo[0];
    const curr = lastTwo[1];
    const prevRetPct = prev.total > 0 ? (prev.returning / prev.total) * 100 : 0;
    const currRetPct = curr.total > 0 ? (curr.returning / curr.total) * 100 : 0;

    if (currRetPct > prevRetPct && curr.returning < prev.returning) {
      insights.push(
        isId
          ? `Porsi peserta kembali naik dari ${formatPct(prevRetPct, lang)} di ${prev.label} ke ${formatPct(currRetPct, lang)} di ${curr.label} — tetapi jumlah orangnya justru turun dari ${formatCount(prev.returning, lang)} ke ${formatCount(curr.returning, lang)}. Ini karena ${curr.label} jauh lebih kecil (${formatCount(curr.total, lang)} vs ${formatCount(prev.total, lang)} peserta): porsi lebih tinggi di atas basis lebih kecil tetap berarti lebih sedikit orang.`
          : `Returning rate rose from ${formatPct(prevRetPct, lang)} at ${prev.label} to ${formatPct(currRetPct, lang)} at ${curr.label} — yet the absolute count dropped from ${formatCount(prev.returning, lang)} to ${formatCount(curr.returning, lang)}. ${curr.label} had a smaller base (${formatCount(curr.total, lang)} vs ${formatCount(prev.total, lang)}): a higher rate on a smaller base still means fewer people.`
      );
    }
  }

  if (insights.length === 0) return null;

  return (
    <section className="tint-amber rounded-card px-5 py-4">
      <h3 className="mb-2 flex items-center gap-2 font-display text-[14px] font-bold text-ink">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {isId ? "Yang perlu dibaca hati-hati" : "Read carefully"}
      </h3>
      <div className="space-y-3">
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
        ? `Hanya ${formatPct(data.returningPct, lang)} yang kembali. Pertimbangkan program follow-up pasca-event (email, WhatsApp) untuk mendorong kehadiran ulang.`
        : `Only ${formatPct(data.returningPct, lang)} returned. Consider post-event follow-up programs (email, WhatsApp) to drive repeat attendance.`
    );
  }

  if (data.skipAfterOneReturn > 0) {
    recs.push(
      isId
        ? `${formatCount(data.skipAfterOneReturn, lang)} orang melewatkan satu event lalu kembali — ada potensi reaktivasi. Target segmen ini dengan penawaran khusus.`
        : `${formatCount(data.skipAfterOneReturn, lang)} people skipped an event then returned — there is reactivation potential. Target this segment with special offers.`
    );
  }

  if (data.churn.length > 0) {
    const worstChurn = data.churn.reduce((a, b) => (a.notReturnedPct > b.notReturnedPct ? a : b));
    recs.push(
      isId
        ? `${worstChurn.label} memiliki tingkat churn tertinggi (${formatPct(worstChurn.notReturnedPct, lang)}). Lakukan survey peserta yang tidak kembali.`
        : `${worstChurn.label} has the highest churn rate (${formatPct(worstChurn.notReturnedPct, lang)}). Survey attendees who did not return.`
    );
  }

  if (recs.length === 0) {
    recs.push(
      isId
        ? "Belum cukup data untuk menghasilkan rekomendasi spesifik. Tambahkan lebih banyak event untuk melihat tren."
        : "Not enough data to generate specific recommendations. Add more events to see trends."
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
