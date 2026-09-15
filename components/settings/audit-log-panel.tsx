"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FlaskConical, ChevronDown, ChevronRight, Shield, Mail, UserCog, Key, Upload, Eye } from "lucide-react";
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

function retentionLabel(t: Dict, cls: RetentionClass): string {
  return cls === "operational" ? t.audit.retOperational : cls === "compliance" ? t.audit.retCompliance : t.audit.retOther;
}

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
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

function formatTime(iso: string | null, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE[lang], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

function toDateKey(iso: string | null): string {
  if (!iso) return "unknown";
  try {
    const d = new Date(iso);
    const jkt = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    return `${jkt.getFullYear()}-${String(jkt.getMonth() + 1).padStart(2, "0")}-${String(jkt.getDate()).padStart(2, "0")}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function dateLabel(dateKey: string, lang: Lang, t: Dict): string {
  const today = new Date();
  const todayJkt = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const todayKey = `${todayJkt.getFullYear()}-${String(todayJkt.getMonth() + 1).padStart(2, "0")}-${String(todayJkt.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(todayJkt);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (dateKey === todayKey) return t.audit.dateToday;
  if (dateKey === yesterdayKey) return t.audit.dateYesterday;

  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "long", year: "numeric" }).format(dt);
  } catch {
    return dateKey;
  }
}

function actionIcon(action: string) {
  if (action.startsWith("suppression")) return <Shield className="h-3.5 w-3.5 text-red" aria-hidden />;
  if (action.startsWith("campaign") || action.includes("send")) return <Mail className="h-3.5 w-3.5 text-blue" aria-hidden />;
  if (action.includes("profile") || action.includes("demographic")) return <UserCog className="h-3.5 w-3.5 text-amber" aria-hidden />;
  if (action.startsWith("role")) return <Key className="h-3.5 w-3.5 text-green" aria-hidden />;
  if (action.includes("import")) return <Upload className="h-3.5 w-3.5 text-ink-soft" aria-hidden />;
  return <Eye className="h-3.5 w-3.5 text-ink-faint" aria-hidden />;
}

const inputCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

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

function SummaryCards({ rows }: { rows: AuditRow[] }) {
  const { lang, t } = useI18n();
  const au = t.audit;

  const todayJkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const todayKey = `${todayJkt.getFullYear()}-${String(todayJkt.getMonth() + 1).padStart(2, "0")}-${String(todayJkt.getDate()).padStart(2, "0")}`;

  const todayRows = rows.filter((r) => toDateKey(r.occurred_at) === todayKey);
  const todayCount = todayRows.length;

  const actionCounts: Record<string, number> = {};
  const actorCounts: Record<string, number> = {};
  for (const r of todayRows) {
    actionCounts[r.action] = (actionCounts[r.action] || 0) + 1;
    if (r.actor_email) actorCounts[r.actor_email] = (actorCounts[r.actor_email] || 0) + 1;
  }
  const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topActor = Object.entries(actorCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="glass rounded-card p-4">
        <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{au.summaryToday}</p>
        <p className="mt-1 font-display text-[28px] font-black text-ink">{formatCount(todayCount, lang)}</p>
        <p className="font-body text-[12px] text-ink-soft">{au.summaryEntries}</p>
      </div>
      <div className="glass rounded-card p-4">
        <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{au.summaryTopActions}</p>
        <div className="mt-2 flex flex-col gap-1">
          {topActions.length === 0 && <p className="font-body text-[12px] text-ink-faint">—</p>}
          {topActions.map(([action, count]) => (
            <div key={action} className="flex items-center gap-2">
              {actionIcon(action)}
              <span className="font-mono text-[11px] text-ink">{action}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-soft">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="glass rounded-card p-4">
        <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{au.summaryTopActor}</p>
        {topActor ? (
          <>
            <p className="mt-1 font-mono text-[13px] text-ink">{topActor[0]}</p>
            <p className="font-body text-[12px] text-ink-soft">{formatCount(topActor[1], lang)} {au.summaryEntries}</p>
          </>
        ) : (
          <p className="mt-1 font-body text-[12px] text-ink-faint">—</p>
        )}
      </div>
    </div>
  );
}

function CompactRow({ row, lang, t }: { row: AuditRow; lang: Lang; t: Dict }) {
  const [expanded, setExpanded] = useState(false);
  const cls = classifyAction(row.action);
  const artifact = isArtifact(row.id);
  const note = artifactNote(t, row.id);

  return (
    <div className="border-b border-glass-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-glass"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
        <span className="w-14 shrink-0 font-mono text-[11px] text-ink-soft">{formatTime(row.occurred_at, lang)}</span>
        <span className="w-36 shrink-0 truncate font-mono text-[11px] text-ink-soft">{row.actor_email ?? t.audit.systemActor}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {actionIcon(row.action)}
          <span className="font-mono text-[11px] text-ink">{row.action}</span>
        </span>
        {artifact && (
          <span className="ml-1 flex items-center gap-1 text-ink-faint">
            <FlaskConical className="h-3 w-3" aria-hidden />
            <span className="font-display text-[10px] font-bold uppercase tracking-wide">{t.audit.artifactTag}</span>
          </span>
        )}
        <span className="ml-auto max-w-[300px] truncate font-body text-[12px] text-ink-soft">{row.summary ?? "—"}</span>
      </button>
      {expanded && (
        <div className="ml-10 flex flex-col gap-1.5 px-4 pb-3 pt-0">
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-body text-[12px] text-ink-soft">
            <span>{t.audit.thTime}: {formatTs(row.occurred_at, lang)}</span>
            <span>{t.audit.thRetention}: <Badge tone={RETENTION_TONE[cls]}>{retentionLabel(t, cls)}</Badge></span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-body text-[12px] text-ink-soft">
            <span>{t.audit.thTarget}: {row.target_table ?? "—"}{row.target_id ? ` / ${row.target_id}` : ""}</span>
          </div>
          <div className="font-body text-[12px] text-ink-soft">
            {t.audit.thSummary}: {row.summary ?? "—"}
          </div>
          {artifact && note && (
            <p className="font-body text-[11px] italic text-ink-faint">{note}</p>
          )}
        </div>
      )}
    </div>
  );
}

function todayIso(): string {
  const now = new Date();
  const jkt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  return `${jkt.getFullYear()}-${String(jkt.getMonth() + 1).padStart(2, "0")}-${String(jkt.getDate()).padStart(2, "0")}`;
}

type RangePreset = "today" | "7d" | "30d" | "all";

function presetToRange(preset: RangePreset): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  const today = todayIso();
  const todayStart = `${today}T00:00:00`;
  const todayEnd = `${today}T23:59:59`;
  if (preset === "today") return { from: todayStart, to: todayEnd };
  const d = new Date();
  const jkt = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const days = preset === "7d" ? 7 : 30;
  jkt.setDate(jkt.getDate() - days + 1);
  const fromKey = `${jkt.getFullYear()}-${String(jkt.getMonth() + 1).padStart(2, "0")}-${String(jkt.getDate()).padStart(2, "0")}`;
  return { from: `${fromKey}T00:00:00`, to: todayEnd };
}

export function AuditLogPanel() {
  const { lang, t } = useI18n();

  const defaultRange = presetToRange("today");
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [applied, setApplied] = useState({ action: "", actorEmail: "", from: defaultRange.from, to: defaultRange.to });
  const [category, setCategory] = useState<AuditCategory>("compliance");
  const [page, setPage] = useState(1);
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");

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
    const def = presetToRange("today");
    setAction("");
    setActorEmail("");
    setFrom(def.from);
    setTo(def.to);
    setApplied({ action: "", actorEmail: "", from: def.from, to: def.to });
    setCategory("compliance");
    setRangePreset("today");
    setPage(1);
  };
  const switchCategory = (c: AuditCategory) => {
    setCategory(c);
    setPage(1);
  };
  const applyPreset = (preset: RangePreset) => {
    setRangePreset(preset);
    const r = presetToRange(preset);
    setFrom(r.from);
    setTo(r.to);
    setApplied((prev) => ({ ...prev, from: r.from, to: r.to }));
    setPage(1);

    try {
      localStorage.setItem("crm_audit_log_range", preset);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem("crm_audit_log_range");
      if (stored && ["today", "7d", "30d", "all"].includes(stored)) {
        applyPreset(stored as RangePreset);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? AUDIT_DEFAULT_PAGE_SIZE;
  const rows = data?.rows ?? [];
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + rows.length;
  const hasNext = page * pageSize < total;

  const onFrom = (v: string) => setFrom(v ? `${v}T00:00:00` : "");
  const onTo = (v: string) => setTo(v ? `${v}T23:59:59` : "");

  // Group rows by date for visual separators
  const groupedRows: { dateKey: string; rows: AuditRow[] }[] = [];
  let currentGroup: { dateKey: string; rows: AuditRow[] } | null = null;
  for (const row of rows) {
    const dk = toDateKey(row.occurred_at);
    if (!currentGroup || currentGroup.dateKey !== dk) {
      currentGroup = { dateKey: dk, rows: [] };
      groupedRows.push(currentGroup);
    }
    currentGroup.rows.push(row);
  }

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

      {/* Summary cards */}
      {data && <SummaryCards rows={rows} />}

      {/* Category toggle */}
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

      {/* Date range presets */}
      <div className="flex flex-wrap gap-2">
        {([
          ["today", t.audit.rangeToday],
          ["7d", t.audit.range7d],
          ["30d", t.audit.range30d],
          ["all", t.audit.rangeAll],
        ] as [RangePreset, string][]).map(([preset, label]) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            className={`rounded-sm px-3 py-1 font-display text-[11px] font-bold uppercase tracking-wide transition-colors ${
              rangePreset === preset ? "bg-red text-white" : "border border-glass-border text-ink-soft hover:bg-glass"
            }`}
          >
            {label}
          </button>
        ))}
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

      {/* Compact log with date groups */}
      <div className="overflow-hidden rounded-card border border-glass-border">
        {loading ? (
          <p className="px-4 py-16 text-center font-body text-[14px] text-ink-soft">{t.audit.loading}</p>
        ) : error ? (
          <div className="px-4 py-16 text-center">
            <Badge tone="red">{t.audit.failed}</Badge>
            <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-16 text-center font-body text-[14px] text-ink-soft">{t.audit.noMatch}</p>
        ) : (
          groupedRows.map((group) => (
            <div key={group.dateKey}>
              <div className="sticky top-0 z-10 border-b border-glass-border bg-glass px-4 py-2">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  {dateLabel(group.dateKey, lang, t)}
                </span>
              </div>
              {group.rows.map((row) => (
                <CompactRow key={row.id} row={row} lang={lang} t={t} />
              ))}
            </div>
          ))
        )}
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
