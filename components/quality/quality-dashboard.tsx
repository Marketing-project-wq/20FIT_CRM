"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Why } from "@/components/ui/why";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct, formatDate, formatDateTime } from "@/lib/i18n/format";
import {
  ARTIFACTS_VERIFIED_ON_ISO,
  VERIFIED_ARTIFACTS,
  fillTone,
  issueTone,
  pct,
  type IssueCount,
  type QualitySnapshot,
  type Tone,
} from "@/lib/crm/quality-types";

type Dict = ReturnType<typeof useI18n>["t"];
type Lang = ReturnType<typeof useI18n>["lang"];

/** Tint classes come from globals.css (.tint-*). Never a raw colour here. */
const TINT: Record<Tone, string> = {
  red: "tint-red",
  amber: "tint-amber",
  green: "tint-green",
  neutral: "tint-neutral",
};

/**
 * Key→dictionary resolvers (Sprint 5B). The display strings live in the dictionary keyed by the
 * row's data key; the value the server computed (still Indonesian) is passed as the FALLBACK, so a
 * key with no dictionary entry shows the server text rather than a blank. quality-i18n.test.ts
 * fails if any key is missing in either language, so the fallback is a safety net, not the plan.
 */
function labelOf(map: Record<string, string>, key: string, fallback: string): string {
  return map[key] ?? fallback;
}
function warnOf(t: Dict, prefix: string, key: string, fallback?: string): string | undefined {
  return (t.quality.warn as Record<string, string>)[`${prefix}_${key}`] ?? fallback;
}

/** Horizontal fill bar — neutral track, tone fill, re-tints with the theme, never a hex value. */
function FillBar({ rate, tone, aria }: { rate: number; tone: Tone; aria: string }) {
  return (
    <div className="tint-neutral h-1.5 w-full overflow-hidden rounded-full" role="img" aria-label={aria}>
      <div
        className={`${TINT[tone]} h-full rounded-full`}
        style={{ width: `${Math.max(rate, rate > 0 ? 1 : 0)}%` }}
      />
    </div>
  );
}

function Panel({ title, caption, children }: { title: string; caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass shadow-glass p-6">
      <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">{title}</h2>
      {caption && (
        <p className="mt-1.5 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">{caption}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * A defect figure with the exact definition of what was counted. K-28: the count + label stay on
 * the line; the definition (the "why / exactly what was counted") moves into a collapsed <Why>.
 */
function IssueRow({ issue, total, lang, definition }: { issue: IssueCount; total: number; lang: Lang; definition: string }) {
  const tone = issueTone(issue.count);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="font-body text-[14px] font-semibold text-ink">{issue.label}</p>
        <Why>{definition}</Why>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-[13px] text-ink-faint">
          {total > 0 ? formatPct(pct(issue.count, total), lang) : "—"}
        </span>
        <Badge tone={tone}>{formatCount(issue.count, lang)}</Badge>
      </div>
    </div>
  );
}

/** Resolve an IssueCount's label + definition from the dict (identifiers/anomalies/duplicates/queues
 *  all share the `issue` mapping), keeping the server text as fallback. */
function resolvedIssue(t: Dict, issue: IssueCount): { issue: IssueCount; definition: string } {
  const label = labelOf(t.quality.issueLabel as Record<string, string>, issue.key, issue.label);
  const definition = warnOf(t, "issue", issue.key, issue.definition) ?? issue.definition;
  return { issue: { ...issue, label }, definition };
}

export function QualityDashboard() {
  const { t, lang } = useI18n();
  const q = t.quality;
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
        setError(body?.message || `${q.loadFailed} (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as QualitySnapshot);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(q.connectFailed);
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [q.loadFailed, q.connectFailed]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{q.title}</h1>
          <p className="mt-2 max-w-2xl font-body text-[14px] leading-relaxed text-ink-soft">
            {q.subtitlePre} <span className="font-mono text-[13px]">master_customer</span> {q.subtitlePost}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-sm border border-glass-border bg-glass px-4 font-display text-[13px] font-bold uppercase tracking-wide text-ink transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-red disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {q.recompute}
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

      {loading && !data && <p className="font-body text-[14px] text-ink-soft">{q.computing}</p>}

      {data && (
        <>
          {/* Reachability caveat FIRST — "has an identifier" is the single most misreadable number. */}
          <div className="glass shadow-glass p-6">
            <div className="flex items-center gap-2">
              <ShieldQuestion className="h-4 w-4 text-amber" aria-hidden />
              <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{q.reachTitle}</h2>
            </div>
            <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
              {q.reachBody1} {formatCount(total, lang)} {q.reachBody2}{" "}
              <span className="font-mono text-[12px]">crm_consent</span> {q.reachBody3}{" "}
              <span className="font-mono text-[12px]">crm_suppression</span> {q.reachBody4}
            </p>
          </div>

          <Panel
            title={q.panel.fillTitle}
            caption={`${q.caption.fillPre} ${formatCount(total, lang)} ${q.caption.fillPost}`}
          >
            <div className="space-y-4">
              {data.fillRates.map((f) => {
                const rate = pct(f.filled, total);
                const tone = fillTone(rate);
                const label = labelOf(q.fillLabel as Record<string, string>, f.key, f.label);
                const note = warnOf(t, "fill", f.key, f.note);
                return (
                  <div key={f.key}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-body text-[14px] font-semibold text-ink">
                        {label} <span className="font-mono text-[12px] font-normal text-ink-faint">{f.column}</span>
                      </p>
                      <p className="font-mono text-[13px] text-ink">
                        {formatPct(rate, lang)}{" "}
                        <span className="text-ink-faint">· {formatCount(f.filled, lang)}/{formatCount(total, lang)}</span>
                      </p>
                    </div>
                    <div className="mt-2">
                      <FillBar rate={rate} tone={tone} aria={`${formatPct(rate, lang)} ${q.fillBarAria}`} />
                    </div>
                    {note && <Why>{note}</Why>}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title={q.panel.identifiersTitle} caption={q.caption.identifiers}>
            {data.identifiers.map((i) => {
              const r = resolvedIssue(t, i);
              return <IssueRow key={i.key} issue={r.issue} definition={r.definition} total={total} lang={lang} />;
            })}
          </Panel>

          <Panel title={q.panel.anomaliesTitle} caption={q.caption.anomalies}>
            {data.anomalies.map((i) => {
              const r = resolvedIssue(t, i);
              return <IssueRow key={i.key} issue={r.issue} definition={r.definition} total={total} lang={lang} />;
            })}
          </Panel>

          <Panel title={q.panel.duplicatesTitle} caption={q.caption.duplicates}>
            {data.duplicates.map((i) => {
              const r = resolvedIssue(t, i);
              return <IssueRow key={i.key} issue={r.issue} definition={r.definition} total={total} lang={lang} />;
            })}
          </Panel>

          <Panel title={q.panel.queuesTitle} caption={q.caption.queues}>
            {data.queues.map((i) => {
              const r = resolvedIssue(t, i);
              return <IssueRow key={i.key} issue={r.issue} definition={r.definition} total={total} lang={lang} />;
            })}
          </Panel>

          <Panel title={q.panel.satellitesTitle} caption={q.caption.satellites}>
            <div className="space-y-3.5">
              {data.satellites.map((s) => {
                const rate = pct(s.rows, total);
                const label = labelOf(q.satelliteLabel as Record<string, string>, s.key, s.label);
                const note = warnOf(t, "satellite", s.key, s.note) ?? s.note;
                return (
                  <div
                    key={s.key}
                    className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[14px] font-semibold text-ink">
                        {label} <span className="font-mono text-[12px] font-normal text-ink-faint">{s.table}</span>
                      </p>
                      <Why>{note}</Why>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[13px] text-ink-faint">{formatPct(rate, lang)}</span>
                      <Badge tone={s.rows === 0 ? "neutral" : "green"}>
                        {formatCount(s.rows, lang)}/{formatCount(total, lang)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title={q.panel.ecosystemTitle} caption={q.caption.ecosystem}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-body text-[14px] font-semibold text-ink">{q.eco.totalRows}</p>
                <p className="font-mono text-[13px] text-ink">{formatCount(data.ecosystem.totalRows, lang)}</p>
              </div>

              <div className="space-y-3 border-t border-glass-border pt-3">
                <p className="font-body text-[12px] text-ink-soft">{q.eco.spreadNote}</p>
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
                            {formatPct(rate, lang)} <span className="text-ink-faint">· {formatCount(u.rows, lang)}</span>
                          </p>
                        </div>
                        <div className="mt-1.5">
                          <FillBar rate={rate} tone="neutral" aria={`${formatPct(rate, lang)}`} />
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border pt-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-body text-[14px] font-semibold text-ink">{q.eco.futureLabel}</p>
                  <Why>{q.warn.ecoSpreadFuture}</Why>
                </div>
                <Badge tone={issueTone(data.ecosystem.futureDated)}>{formatCount(data.ecosystem.futureDated, lang)}</Badge>
              </div>
            </div>
          </Panel>

          {data.stagingCoverage && (
            <Panel title={q.panel.stagingTitle} caption={q.caption.staging}>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-sm border border-glass-border p-3">
                    <div className="font-display text-[22px] font-black leading-none text-ink">{formatCount(data.stagingCoverage.rowsTotal, lang)}</div>
                    <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">{q.staging.rowsImport}</div>
                  </div>
                  <div className="rounded-sm border border-glass-border p-3">
                    <div className="font-display text-[22px] font-black leading-none text-ink">{formatCount(data.stagingCoverage.withEmail, lang)}</div>
                    <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">{q.staging.hasEmail}</div>
                  </div>
                  <div className="rounded-sm border border-glass-border p-3">
                    <div className="font-display text-[22px] font-black leading-none text-ink">{formatCount(data.stagingCoverage.withDob, lang)}</div>
                    <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">{q.staging.hasDob}</div>
                  </div>
                </div>

                {/* Birth-date parse outcomes — numbers carry the emphasis through COLOR, not weight. */}
                <div className="border-t border-glass-border pt-3">
                  <p className="font-body text-[13px] font-semibold text-ink">{q.staging.dobParseTitle}</p>
                  <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">
                    <span className="text-ink">{formatCount(data.stagingCoverage.dobParsed, lang)}</span> {q.staging.parsed} ·{" "}
                    <span className="text-ink">{formatCount(data.stagingCoverage.dobUnparseable, lang)}</span> {q.staging.failed} ·{" "}
                    <span className="text-ink">{formatCount(data.stagingCoverage.dobAmbiguousDayMonth, lang)}</span> {q.staging.ambiguous} ·{" "}
                    <span className="text-ink">{formatCount(data.stagingCoverage.dobSwapped, lang)}</span> {q.staging.swapped} ·{" "}
                    <span className="text-ink">{formatCount(data.stagingCoverage.dobImplausible, lang)}</span> {q.staging.implausible}
                  </p>
                  <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                    {q.staging.umurPre} {formatCount(data.stagingCoverage.umurChecked, lang)} {q.staging.umurChecked} ·{" "}
                    <span className="text-ink">{formatCount(data.stagingCoverage.umurYearExact, lang)}</span> {q.staging.umurExact} ·{" "}
                    {formatCount(data.stagingCoverage.umurOffByOne, lang)} {q.staging.umurOff1} ·{" "}
                    <span className="text-ink">{formatCount(data.stagingCoverage.umurConflict, lang)}</span> {q.staging.umurConflict}
                  </p>
                </div>

                {/* RFM spread — misspelling kept; 0 shown (K-08). */}
                <div className="border-t border-glass-border pt-3">
                  <p className="font-body text-[13px] font-semibold text-ink">{q.staging.rfmTitle}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.stagingCoverage.rfm.map((r) => (
                      <span key={r.value} className="rounded-sm border border-glass-border px-2.5 py-1 font-mono text-[12px] text-ink">
                        {r.value === "-" ? q.staging.noBucket : r.value}: {formatCount(r.count, lang)}
                      </span>
                    ))}
                  </div>
                  <Why>{q.warn.stagingRfm}</Why>
                </div>

                {/* Program participation — every column incl. the all-zero ones (K-08). */}
                <div className="border-t border-glass-border pt-3">
                  <p className="font-body text-[13px] font-semibold text-ink">{q.staging.programTitle}</p>
                  <Why>{q.warn.stagingProgram}</Why>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.stagingCoverage.programs.map((p) => (
                      <span
                        key={p.key}
                        className="rounded-sm border border-glass-border px-2.5 py-1 font-mono text-[12px] text-ink"
                      >
                        {p.label}{p.clinical ? " ⚕" : ""}: {formatCount(p.count, lang)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <Panel title={q.panel.enrichmentTitle} caption={q.caption.enrichment}>
            <div className="space-y-3.5">
              {data.enrichmentCoverage.map((s) => (
                <div key={s.key} className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">{s.label}</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      {formatCount(s.matchedProfiles, lang)} {q.enrich.matchedFrom} {formatCount(s.sourceRows, lang)} {q.enrich.sourceRows}
                      {" · "}{formatCount(Math.max(s.sourceRows - s.matchedProfiles, 0), lang)} {q.enrich.unmatched}
                    </p>
                  </div>
                  <Badge tone={s.matchedProfiles === 0 ? "neutral" : "amber"}>
                    {formatCount(s.matchedProfiles, lang)}/{formatCount(s.sourceRows, lang)}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={q.panel.multisourceTitle} caption={q.caption.multisource}>
            <div className="space-y-3.5">
              {data.multiSourceCoverage.map((s) => (
                <div key={s.key} className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">{s.label}</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      {formatCount(s.matchedProfiles, lang)} {q.multi.matched} · {formatCount(s.withKey, lang)} {q.multi.hasEmail} · {formatCount(s.sourceRows, lang)} {q.multi.rows}
                    </p>
                    <p className="mt-0.5 font-body text-[11px] text-ink-faint">
                      {s.withKey < s.sourceRows
                        ? `${formatCount(s.sourceRows - s.withKey, lang)} ${q.multi.noEmailPre}`
                        : q.multi.allHaveEmail}
                      {" · "}
                      {formatCount(Math.max(s.withKey - s.matchedProfiles, 0), lang)} {q.multi.hasEmailNoMaster}
                    </p>
                  </div>
                  <Badge tone={s.matchedProfiles === 0 ? "neutral" : "amber"}>
                    {formatCount(s.matchedProfiles, lang)}/{formatCount(s.sourceRows, lang)}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>

          {data.clinicCoverage && (
            <Panel title={q.panel.clinicTitle} caption={q.caption.clinic}>
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">clinic_patients</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      <strong>{formatCount(data.clinicCoverage.matchedByPhone, lang)}</strong> {q.clinic.matchedPhone} ·{" "}
                      {formatCount(data.clinicCoverage.matchedByEmail, lang)} {q.clinic.matchedEmail} · {q.clinic.fromPatients} {formatCount(data.clinicCoverage.patientsRows, lang)} {q.clinic.patients}
                    </p>
                    <p className="mt-0.5 font-body text-[11px] text-ink-faint">
                      {formatCount(data.clinicCoverage.patientsWithPhone, lang)} {q.clinic.hasPhone} ·{" "}
                      {formatCount(data.clinicCoverage.patientsWithEmail, lang)} {q.clinic.hasEmail}
                    </p>
                    <Why>{q.warn.clinicPhoneWhy}</Why>
                  </div>
                  <Badge tone={data.clinicCoverage.matchedByPhone === 0 ? "neutral" : "amber"}>
                    {formatCount(data.clinicCoverage.matchedByPhone, lang)}/{formatCount(data.clinicCoverage.patientsRows, lang)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-glass-border py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[14px] font-semibold text-ink">{q.clinic.txTitle}</p>
                    <p className="mt-1 font-body text-[12px] text-ink-soft">
                      {formatCount(data.clinicCoverage.transactionsLinked, lang)} {q.clinic.txLinked} · <strong>{formatCount(data.clinicCoverage.transactionsNullFk, lang)} {q.clinic.txNullFk}</strong> {q.clinic.txFrom} {formatCount(data.clinicCoverage.transactionsTotal, lang)}
                    </p>
                    <Why>{q.warn.clinicTxWhy}</Why>
                  </div>
                  <Badge tone={issueTone(data.clinicCoverage.transactionsNullFk)}>
                    {formatCount(data.clinicCoverage.transactionsNullFk, lang)}
                  </Badge>
                </div>
                <p className="border-t border-glass-border pt-3 font-body text-[11px] text-ink-faint">
                  {q.clinic.sparsePre}{" "}
                  {data.clinicCoverage.sparse.map((tt) => `${tt.table} (${formatCount(tt.rows, lang)})`).join(" · ")}.
                </p>
              </div>
            </Panel>
          )}

          <Panel
            title={q.panel.artifactsTitle}
            caption={`${q.caption.artifactsPre} ${formatDate(ARTIFACTS_VERIFIED_ON_ISO, lang)}, ${q.caption.artifactsPost}`}
          >
            <ul className="space-y-3.5">
              {VERIFIED_ARTIFACTS.map((a) => {
                const label = labelOf(q.artifactLabel as Record<string, string>, a.key, a.label);
                const detail = warnOf(t, "artifact", a.key, a.detail) ?? a.detail;
                return (
                  <li key={a.key} className="border-t border-glass-border pt-3.5 first:border-t-0 first:pt-0">
                    <p className="font-body text-[14px] font-semibold text-ink">{label}</p>
                    <Why>{detail}</Why>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <p className="font-mono text-[11px] text-ink-faint">
            {q.footer.computedPre} {formatDateTime(data.computedAt, lang)} {q.footer.computedPost}
          </p>
        </>
      )}
    </div>
  );
}
