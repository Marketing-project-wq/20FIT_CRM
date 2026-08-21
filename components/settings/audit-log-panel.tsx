"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  RETENTION_TONE,
  classifyAction,
  isArtifact,
} from "@/lib/crm/audit-log-constants";
import type { RetentionClass } from "@/lib/crm/retention-policy";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, type Dict, type Lang } from "@/lib/i18n";
import { LOCALE } from "@/lib/i18n/config";

/** Retention CLASS label from the dict (the constant RETENTION_LABEL stays Indonesian for any
 *  importer/test; the screen renders the localized label here). */
function retentionLabel(t: Dict, cls: RetentionClass): string {
  return cls === "operational" ? t.audit.retOperational : cls === "compliance" ? t.audit.retCompliance : t.audit.retOther;
}

/** Note for a known test-artifact audit row (by id), from the dict. */
function artifactNote(t: Dict, id: number): string | undefined {
  return id === 1 ? t.audit.warn.artifact1 : id === 5 ? t.audit.warn.artifact5 : undefined;
}

interface AuditRow {
  id: number;
  occurred_at: string | null;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: unknown;
}

type AuditCategory = "compliance" | "operational" | "all";

interface AuditCounts {
  compliance: number;
  operational: number;
  other: number;
  total: number;
}

interface AuditGap {
  minId: number | null;
  maxId: number | null;
  count: number;
  span: number;
  missing: number;
  knownLegit: number;
  unexplained: number;
}

interface ApiResult {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  category: AuditCategory;
  counts: AuditCounts;
  gap: AuditGap;
}

function formatTs(iso: string | null, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Compact form (short month) is deliberate for the dense audit rows — locale-aware.
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

const inputCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

/** The honest caveat: this log is not the full history, and nothing has been purged yet. */
function RetentionNote() {
  const w = useI18n().t.audit.warn;
  return (
    <div className="tint-blue rounded-card p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          {w.retentionTitle}
        </h3>
      </div>
      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
        {w.retentionA}
        <span className="font-mono">profile.viewed</span>, <span className="font-mono">list.viewed</span>,{" "}
        <span className="font-mono">search.*</span>, <span className="font-mono">login.*</span>
        {w.retentionB}
        <span className="font-mono">consent.*</span>, <span className="font-mono">suppression.*</span>,{" "}
        <span className="font-mono">role.*</span>, <span className="font-mono">profile.deleted</span>,{" "}
        <span className="font-mono">export.*</span>, <span className="font-mono">retention.*</span>
        {w.retentionC}
      </p>
      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
        {w.retentionNoteA}<span className="font-mono">metadata</span>{w.retentionNoteB}<span className="font-mono">list.viewed</span>{w.retentionNoteC}
      </p>
    </div>
  );
}

/**
 * The id-gap banner — the ONLY visible trace of failed audited operations. A hole in the
 * id sequence means an audit INSERT took its number but its row never committed (rolled
 * back / cancelled / dropped). Shown whenever any id is missing, distinguishing the one
 * documented benign gap (id=4) from unexplained holes = real failures.
 */
function GapNote({ gap }: { gap: AuditGap }) {
  const { lang, t } = useI18n();
  const w = t.audit.warn;
  if (!gap || gap.missing <= 0 || gap.minId == null || gap.maxId == null) return null;
  const alarm = gap.unexplained > 0;
  return (
    <div className={`${alarm ? "tint-red" : "tint-blue"} rounded-card p-4`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          {w.gapTitleA}{gap.missing}{w.gapTitleB}
        </h3>
      </div>
      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
        {w.gapBodyA}<span className="font-mono">{gap.minId}–{gap.maxId}</span>{w.gapBodyB}{formatCount(gap.span, lang)}{w.gapBodyC}<span className="font-mono">{formatCount(gap.count, lang)}</span>{w.gapBodyD}
        {gap.missing}{w.gapBodyE}{gap.knownLegit}{w.gapBodyF}<span className={alarm ? "text-ink" : ""}>{gap.unexplained}</span>{w.gapBodyG}
      </p>
      <p className="mt-2 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
        {w.gapBody2A}{gap.unexplained > 0 && w.gapUnexplainedHint}{w.gapBody2B}
      </p>
    </div>
  );
}

export function AuditLogPanel() {
  const { lang, t } = useI18n();
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ action: "", actorEmail: "", from: "", to: "" });
  // Default view is COMPLIANCE-first: on open, the rows that justify this table's
  // existence (role/consent/suppression/export/retention/profile.deleted) come first.
  // Operational rows are one click away, never hidden.
  const [category, setCategory] = useState<AuditCategory>("compliance");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(AUDIT_DEFAULT_PAGE_SIZE));
    params.set("category", category);
    if (applied.action) params.set("action", applied.action);
    if (applied.actorEmail) params.set("actorEmail", applied.actorEmail);
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);

    try {
      const res = await fetch(`/api/audit?${params.toString()}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `${t.audit.loadFailed} (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as ApiResult);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(t.audit.connFailed);
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [page, applied, category, t]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const applyFilters = () => {
    setApplied({ action: action.trim(), actorEmail: actorEmail.trim(), from, to });
    setPage(1);
  };
  const resetFilters = () => {
    setAction("");
    setActorEmail("");
    setFrom("");
    setTo("");
    setApplied({ action: "", actorEmail: "", from: "", to: "" });
    setCategory("compliance");
    setPage(1);
  };
  const switchCategory = (c: AuditCategory) => {
    setCategory(c);
    setPage(1);
  };

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? AUDIT_DEFAULT_PAGE_SIZE;
  const rows = data?.rows ?? [];
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + rows.length;
  const hasNext = page * pageSize < total;

  // ISO bounds: `from` at start of day, `to` at end of day, so a single-day range works.
  const onFrom = (v: string) => setFrom(v ? `${v}T00:00:00` : "");
  const onTo = (v: string) => setTo(v ? `${v}T23:59:59` : "");

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">
          {t.audit.auditTitle}
        </h2>
        <p className="max-w-2xl font-body text-[13px] text-ink-soft">
          {t.audit.auditSubtitle}
        </p>
      </div>

      <RetentionNote />

      {data?.gap && <GapNote gap={data.gap} />}

      {/* Category toggle (compliance-first default) + ratio over the current range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-sm border border-glass-border">
          {([
            ["compliance", t.audit.catCompliance],
            ["operational", t.audit.catOperational],
            ["all", t.audit.catAll],
          ] as [AuditCategory, string][]).map(([c, label]) => (
            <button
              key={c}
              type="button"
              onClick={() => switchCategory(c)}
              className={`px-4 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${
                category === c ? "bg-red text-white" : "text-ink-soft hover:bg-glass"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <p className="font-mono text-[12px] text-ink-soft">
            {t.audit.inRangeLabel}
            <span className="text-ink">{t.audit.inRangeCompliance}{formatCount(data.counts.compliance, lang)}</span>
            {" · "}
            {t.audit.inRangeOperational}{formatCount(data.counts.operational, lang)}
            {data.counts.other > 0 ? `${t.audit.inRangeOther}${formatCount(data.counts.other, lang)}` : ""}
            {t.audit.inRangeTotal}
            {formatCount(data.counts.total, lang)}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.audit.filterActionLabel}</span>
          <input className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} placeholder={t.audit.filterActionPlaceholder} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.audit.filterActorLabel}</span>
          <input className={inputCls} value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} placeholder={t.audit.filterActorPlaceholder} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.audit.filterFrom}</span>
          <input type="date" className={inputCls} onChange={(e) => onFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.audit.filterTo}</span>
          <input type="date" className={inputCls} onChange={(e) => onTo(e.target.value)} />
        </label>
        <button type="button" onClick={applyFilters} className="h-9 rounded-sm bg-red px-4 font-display text-[12px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90">
          {t.audit.apply}
        </button>
        <button type="button" onClick={resetFilters} className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass">
          {t.audit.reset}
        </button>
      </div>

      <div className="overflow-x-auto rounded-card border border-glass-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-bold">{t.audit.thTime}</th>
              <th className="px-4 py-3 font-bold">{t.audit.thActor}</th>
              <th className="px-4 py-3 font-bold">{t.audit.thAction}</th>
              <th className="px-4 py-3 font-bold">{t.audit.thRetention}</th>
              <th className="px-4 py-3 font-bold">{t.audit.thTarget}</th>
              <th className="px-4 py-3 font-bold">{t.audit.thSummary}</th>
            </tr>
          </thead>
          <tbody className="font-body text-[13px] text-ink">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-ink-soft">{t.audit.loading}</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center"><Badge tone="red">{t.audit.failed}</Badge><p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-ink-soft">{t.audit.noMatch}</td></tr>
            ) : (
              rows.map((r) => {
                const cls = classifyAction(r.action);
                const artifact = isArtifact(r.id);
                const note = artifactNote(t, r.id);
                return (
                  <tr key={r.id} className="border-b border-glass-border last:border-0 align-top hover:bg-glass">
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {formatTs(r.occurred_at, lang)}
                      {artifact && (
                        <span className="mt-1 flex items-center gap-1 text-ink-faint" title={note}>
                          <FlaskConical className="h-3 w-3" aria-hidden />
                          <span className="font-display text-[10px] font-bold uppercase tracking-wide">{t.audit.artifactTag}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.actor_email ?? <span className="text-ink-faint">{t.audit.systemActor}</span>}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.action}</td>
                    <td className="px-4 py-3"><Badge tone={RETENTION_TONE[cls]}>{retentionLabel(t, cls)}</Badge></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-soft">
                      {r.target_table ?? "—"}
                      {r.target_id && <div className="text-ink-faint">{r.target_id}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {artifact && note && (
                        <p className="mb-1 font-body text-[11px] italic text-ink-faint">{note}</p>
                      )}
                      <p className="max-w-md text-ink-soft">{r.summary ?? "—"}</p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-faint">
          {total === 0 ? t.audit.zeroRows : `${t.audit.showingPre}${formatCount(firstRow, lang)}–${formatCount(lastRow, lang)}${t.audit.showingOf}${formatCount(total, lang)}`}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1} className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
            {t.audit.prev}
          </button>
          <span className="font-mono text-[12px] text-ink-soft">{t.audit.pageLabel} {formatCount(page, lang)}</span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={loading || !hasNext} className="rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
            {t.audit.next}
          </button>
        </div>
      </div>

      <p className="font-mono text-[11px] text-ink-faint">{t.audit.warn.footer}</p>
    </section>
  );
}
