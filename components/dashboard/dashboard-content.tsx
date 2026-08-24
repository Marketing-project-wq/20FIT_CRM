"use client";

import { useCallback, useEffect, useState } from "react";
import { StatCard } from "./stat-card";
import { BarList } from "./bar-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Why } from "@/components/ui/why";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatDate, formatDateTime } from "@/lib/i18n";
import type { FilterNode } from "@/lib/crm/filter-tree";

/** Contact-coverage category → the AND filter tree the existing /api/exports engine understands.
 *  Presence (hasPhone/hasEmail) + absence (noPhone/noEmail) leaves; one engine, no second path. */
type CoverageCat = "both" | "emailOnly" | "phoneOnly" | "neither";
const COVERAGE_LEAVES: Record<CoverageCat, [string, string]> = {
  both: ["hasEmail", "hasPhone"],
  emailOnly: ["hasEmail", "noPhone"],
  phoneOnly: ["hasPhone", "noEmail"],
  neither: ["noPhone", "noEmail"],
};
function coverageTree(cat: CoverageCat): FilterNode {
  const [a, b] = COVERAGE_LEAVES[cat];
  return { kind: "group", op: "AND", children: [
    { kind: "condition", field: a as never },
    { kind: "condition", field: b as never },
  ] };
}

interface SourceGap { key: string; total: number; inPool: number; gap: number }
interface UnitCount { unit: string; profiles: number; source: "mirror" | "live" }
interface ProductCount { product: string; registrations: number }
interface ContactCoverage { both: number; emailOnly: number; phoneOnly: number; neither: number }
interface MirrorMeta { refreshedAt: string | null; rowCount: number | null }
interface Candidates { total: number; bySource: { source: string; count: number }[] }
interface Fitco { matched: number; unmatched: number }

// The blocks the dashboard loads independently (mirror lib/crm/dashboard.ts server shapes).
interface ImmediateBlock { audienceSize: number; lastProfileAt: string | null; contactCoverage: ContactCoverage; importDob: number }
interface ContactableBlock { contactableMarketing: number; contactableService: number }
interface MirrorBlock { unitSpread: UnitCount[]; importRfm: { value: string; count: number }[]; candidates: Candidates; fitco: Fitco; mirror: MirrorMeta }
interface EventsBlock { eventRegistrations: ProductCount[] }
interface SourcesBlock { liveSources: SourceGap[] }

/** The whole-page fixture shape (dev preview) — the union of every block. */
export interface DashboardStats extends ImmediateBlock, ContactableBlock, MirrorBlock, EventsBlock, SourcesBlock {}

type BlockName = "immediate" | "contactable" | "mirror" | "events" | "sources";
type Status = "loading" | "ready" | "error" | "denied";
interface Block<T> { status: Status; data: T | null }

const DASH = "—"; // "no source": nothing to measure (K-08). NEVER a loading state.
const EVENT_TOP = 10;
/** A mirror snapshot older than this reads as "may be behind" on screen (24h — the manual refresh
 *  cadence vs daily-growing sources; see the Freshness sprint). */
const STALE_THRESHOLD_HOURS = 24;

function FreshTag({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] font-normal text-ink-faint">· {children}</span>;
}

function srcLabel(t: ReturnType<typeof useI18n>["t"], key: string): string {
  const d = t.dashboard;
  return key === "my20fit" ? d.srcMy20fit
    : key === "hyrox" ? d.srcHyrox
    : key === "arena" ? d.srcArena
    : key === "gym" ? d.srcGym
    : key === "clinic" ? d.srcClinic
    : key;
}

/** Split a full fixture into the five blocks (dev preview all-ready path). */
function blocksFromStats(s: DashboardStats) {
  return {
    immediate: { audienceSize: s.audienceSize, lastProfileAt: s.lastProfileAt, contactCoverage: s.contactCoverage, importDob: s.importDob } as ImmediateBlock,
    contactable: { contactableMarketing: s.contactableMarketing, contactableService: s.contactableService } as ContactableBlock,
    mirror: { unitSpread: s.unitSpread, importRfm: s.importRfm, candidates: s.candidates, fitco: s.fitco, mirror: s.mirror } as MirrorBlock,
    events: { eventRegistrations: s.eventRegistrations } as EventsBlock,
    sources: { liveSources: s.liveSources } as SourcesBlock,
  };
}

/** Failure state for one section — a spoken dead end WITH a way out (retry), never a spinner that
 *  hangs forever (TUGAS 2). Errors are logged server-side via the Sprint 3K path; here we only
 *  say the section failed and offer to reload it. */
function BlockFail({ t, onRetry }: { t: ReturnType<typeof useI18n>["t"]; onRetry?: () => void }) {
  return (
    <div className="tint-amber rounded-sm px-3 py-2">
      <p className="font-body text-[12px] text-ink">{t.dashboard.blockFailed}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}
          className="mt-1 font-display text-[12px] font-semibold text-blue underline underline-offset-2">
          {t.dashboard.blockRetry}
        </button>
      )}
    </div>
  );
}

/** Skeleton rows shaped like a BarList (label + bar), so the section reserves its final height and
 *  the page does not jump when the data lands (TUGAS 1 + 2). */
function SkelBars({ rows, label }: { rows: number; label: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-28" label={i === 0 ? label : undefined} />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}

type Dict = ReturnType<typeof useI18n>["t"];
type Lang = ReturnType<typeof useI18n>["lang"];

/**
 * D2 — the pool + reach SUMMARY card (replaces three near-identical big-number cards). Pool is the
 * headline (from the fast IMMEDIATE block); the two contactable figures are sub-lines (from the
 * slower live RPC), so they carry their own skeleton until it lands. When all three are equal it
 * collapses to one honest phrase ("whole pool contactable · zero suppression") instead of three
 * copies of the same number.
 */
function PoolReachCard({
  imm, con, immStatus, conStatus, t, lang,
}: {
  imm: ImmediateBlock | null; con: ContactableBlock | null;
  immStatus: Status; conStatus: Status; t: Dict; lang: Lang;
}) {
  const allEqual = imm != null && con != null &&
    imm.audienceSize === con.contactableMarketing && con.contactableMarketing === con.contactableService;
  return (
    <div className="glass shadow-glass relative overflow-hidden p-5 sm:col-span-2">
      <span className="absolute left-0 top-0 h-full w-1 bg-red" aria-hidden />
      <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{t.dashboard.summaryTitle}</p>
      {immStatus === "loading" ? (
        <Skeleton className="mt-2 h-[26px] w-1/2" label={t.dashboard.computing} />
      ) : immStatus === "error" ? (
        <p className="mt-2 font-body text-[13px] font-semibold text-red">{t.dashboard.blockFailed}</p>
      ) : (
        <p className="mt-2 font-display text-[34px] font-black leading-none text-ink">{imm ? formatCount(imm.audienceSize, lang) : DASH}</p>
      )}
      <p className="mt-1 font-mono text-[11px] text-ink-faint">{t.dashboard.summaryPoolLabel}</p>

      <div className="mt-4 border-t border-glass-border pt-3">
        {conStatus === "loading" ? (
          <div className="space-y-2"><Skeleton className="h-3.5 w-2/3" label={t.dashboard.computing} /><Skeleton className="h-3.5 w-1/2" /></div>
        ) : conStatus === "error" ? (
          <p className="font-body text-[12px] font-semibold text-red">{t.dashboard.blockFailed}</p>
        ) : allEqual ? (
          <p className="font-body text-[12px] text-ink">{t.dashboard.summaryReachAll}</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-body text-[12px] text-ink-soft">{t.dashboard.contactableMarketing}</span>
              <span className="font-display text-[15px] font-bold tabular-nums text-ink">{con ? formatCount(con.contactableMarketing, lang) : DASH}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-body text-[12px] text-ink-soft">{t.dashboard.contactableService}</span>
              <span className="font-display text-[15px] font-bold tabular-nums text-ink">{con ? formatCount(con.contactableService, lang) : DASH}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** D2 — the five live-source gaps as ONE compact table instead of five cards. */
function GapTable({ sources, t, lang }: { sources: SourceGap[]; t: Dict; lang: Lang }) {
  return (
    <div className="glass rounded-card overflow-x-auto p-1">
      <table className="w-full min-w-[22rem] border-collapse">
        <thead>
          <tr className="border-b border-glass-border text-left">
            <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.gapTableSource}</th>
            <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.totalLabel}</th>
            <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.gapLabel}</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.key} className="border-b border-glass-border/60 last:border-0">
              <td className="px-3 py-2 font-body text-[13px] text-ink">{srcLabel(t, s.key)}</td>
              <td className="px-3 py-2 text-right font-display text-[14px] font-bold tabular-nums text-ink">{formatCount(s.total, lang)}</td>
              <td className={`px-3 py-2 text-right font-display text-[14px] font-bold tabular-nums ${s.gap > 0 ? "text-amber" : "text-ink"}`}>{formatCount(s.gap, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** D — the deduped "candidates not yet in the pool" card (snapshot). Explicitly labelled as NOT the
 *  pool and NOT the live gap (different population), with its own snapshot freshness. */
function CandidateCard({ candidates, fitco, t, lang, mirrorAt }: {
  candidates: Candidates; fitco: Fitco; t: Dict; lang: Lang; mirrorAt: string | null;
}) {
  return (
    <div className="glass rounded-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[14px] font-bold text-ink">{t.dashboard.candTitle}</h3>
        {mirrorAt && <FreshTag>{t.dashboard.freshSnapshot} · {formatDateTime(mirrorAt, lang)}</FreshTag>}
      </div>
      <p className="mt-2 font-display text-[30px] font-black leading-none text-ink">{formatCount(candidates.total, lang)}</p>
      <p className="mt-1 font-mono text-[11px] text-amber">{t.dashboard.candLabel}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[18rem] border-collapse">
          <thead>
            <tr className="border-b border-glass-border text-left">
              <th className="px-2 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.candSourceCol}</th>
              <th className="px-2 py-1.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.candCountCol}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.bySource.map((r) => (
              <tr key={r.source} className="border-b border-glass-border/60 last:border-0">
                <td className="px-2 py-1.5 font-mono text-[12px] text-ink-soft">{r.source}</td>
                <td className="px-2 py-1.5 text-right font-display text-[13px] font-bold tabular-nums text-ink">{formatCount(r.count, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-body text-[12px] leading-relaxed text-ink-faint">
        {t.dashboard.fitcoTitle}: <span className="font-semibold text-ink">{formatCount(fitco.matched, lang)}</span> {t.dashboard.fitcoMatched} · <span className="font-semibold text-ink">{formatCount(fitco.unmatched, lang)}</span> {t.dashboard.fitcoUnmatched}
      </p>
      <Why>
        <p className="text-[12px] leading-relaxed text-ink-soft">{t.dashboard.candNote}</p>
      </Why>
    </div>
  );
}

/**
 * Dashboard body — loaded PROGRESSIVELY (progressive-load sprint). Instead of one fetch that holds
 * the whole page until the ~2.9s contactable RPC and ~20-page event tally finish, the page fetches
 * five INDEPENDENT blocks in parallel. The cheap block (pool size, freshness, coverage, import DOB)
 * paints in ~250ms; the expensive blocks fill in their OWN reserved place as they arrive, each with
 * its own skeleton and its own failure state.
 *
 * THREE KINDS OF NUMBER kept distinct on screen: LIVE per request; SNAPSHOT (mirror, shows
 * refreshed_at + stale warning); and the FROZEN pool. And the K-08 rule stands: `0` = measured
 * zero, `—` = no source — and a pulsing SKELETON = still computing, never confused with either.
 */
export function DashboardContent(
  { previewStats, previewStatus }: { previewStats?: DashboardStats; previewStatus?: Partial<Record<BlockName, Status>> } = {},
) {
  const { lang, t } = useI18n();
  const isPreview = previewStats != null || previewStatus != null;

  // Build the initial per-block state. In preview we derive from the fixture + the requested
  // per-block status; live, everything starts loading and each fetch fills its own slot.
  const initBlocks = () => {
    const derived = previewStats ? blocksFromStats(previewStats) : null;
    const mk = <T,>(name: BlockName, data: T | null): Block<T> => {
      const status: Status = previewStatus ? (previewStatus[name] ?? "loading") : previewStats ? "ready" : "loading";
      return { status, data: status === "ready" ? data : null };
    };
    return {
      immediate: mk<ImmediateBlock>("immediate", derived?.immediate ?? null),
      contactable: mk<ContactableBlock>("contactable", derived?.contactable ?? null),
      mirror: mk<MirrorBlock>("mirror", derived?.mirror ?? null),
      events: mk<EventsBlock>("events", derived?.events ?? null),
      sources: mk<SourcesBlock>("sources", derived?.sources ?? null),
    };
  };

  const [immediate, setImmediate] = useState<Block<ImmediateBlock>>(() => initBlocks().immediate);
  const [contactable, setContactable] = useState<Block<ContactableBlock>>(() => initBlocks().contactable);
  const [mirrorB, setMirrorB] = useState<Block<MirrorBlock>>(() => initBlocks().mirror);
  const [events, setEvents] = useState<Block<EventsBlock>>(() => initBlocks().events);
  const [sources, setSources] = useState<Block<SourcesBlock>>(() => initBlocks().sources);

  const [showAllEvents, setShowAllEvents] = useState(false);
  const [exportBusy, setExportBusy] = useState<CoverageCat | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const setters: Record<BlockName, (b: Block<unknown>) => void> = {
    immediate: setImmediate as (b: Block<unknown>) => void,
    contactable: setContactable as (b: Block<unknown>) => void,
    mirror: setMirrorB as (b: Block<unknown>) => void,
    events: setEvents as (b: Block<unknown>) => void,
    sources: setSources as (b: Block<unknown>) => void,
  };

  // Fetch ONE block. Its own loading→ready/error/denied lifecycle, independent of the others.
  const loadBlock = useCallback(async (name: BlockName, signal?: AbortSignal) => {
    setters[name]({ status: "loading", data: null });
    try {
      const res = await fetch(`/api/dashboard?block=${name}`, { signal, cache: "no-store" });
      if (res.status === 401 || res.status === 403) { setters[name]({ status: "denied", data: null }); return; }
      if (!res.ok) { setters[name]({ status: "error", data: null }); return; }
      setters[name]({ status: "ready", data: await res.json() });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setters[name]({ status: "error", data: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isPreview) return; // dev preview renders fixture/status directly — no fetch (/dev/* is 404 in prod)
    const ac = new AbortController();
    (["immediate", "contactable", "mirror", "events", "sources"] as BlockName[]).forEach((n) => loadBlock(n, ac.signal));
    return () => ac.abort();
  }, [isPreview, loadBlock]);

  async function exportCoverage(cat: CoverageCat) {
    if (isPreview) return;
    setExportMsg(null);
    setExportBusy(cat);
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree: coverageTree(cat) }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        setExportMsg(d.message ?? `${t.dashboard.coverageExportFailed} (HTTP ${res.status})`);
        return;
      }
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "segmen.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportMsg(t.dashboard.coverageExportFailed);
    } finally {
      setExportBusy(null);
    }
  }

  const todayLabel = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(new Date());

  // A role without list access gets 403 on every block; the immediate block is the sentinel.
  const denied = immediate.status === "denied";

  // KPI value/state helpers, per source block.
  const imm = immediate.data;
  const con = contactable.data;
  const kpi = (blockStatus: Status, value: string) => ({
    value,
    loading: !denied && blockStatus === "loading",
    errorLabel: !denied && blockStatus === "error" ? t.dashboard.blockFailed : undefined,
  });

  const freshKpi = kpi(immediate.status, denied ? DASH : imm ? formatDate(imm.lastProfileAt, lang) : DASH);
  const dobKpi = kpi(immediate.status, denied ? DASH : imm ? formatCount(imm.importDob, lang) : DASH);

  // Mirror snapshot age (unit-spread block).
  const mirrorAt = mirrorB.data?.mirror.refreshedAt ?? null;
  const mirrorAgeHours = mirrorAt ? (Date.now() - new Date(mirrorAt).getTime()) / 3_600_000 : null;
  const mirrorStale = mirrorAgeHours != null && mirrorAgeHours > STALE_THRESHOLD_HOURS;

  const eventList = events.data?.eventRegistrations ?? [];
  const shownEvents = showAllEvents ? eventList : eventList.slice(0, EVENT_TOP);
  const hiddenEventCount = Math.max(eventList.length - EVENT_TOP, 0);

  const cov = imm?.contactCoverage ?? null;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{t.dashboard.title}</h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">{t.dashboard.subtitle}</p>
        </div>
        {/* Prefixed with "Today" so this reads as the current date, NOT when the data was refreshed. */}
        <p className="font-mono text-[12px] text-ink-faint">{t.dashboard.todayLabel} · {todayLabel} · {t.dashboard.tz}</p>
      </header>

      {denied && <p className="font-body text-[13px] text-ink-soft">{t.access.dashboardHidden}</p>}

      {/* KPI row (D2): pool + the two contactable figures are ONE summary card (pool is the
          headline from the fast IMMEDIATE block; the contactable sub-figures arrive with the live
          RPC). The remaining cards stay separate. "Workflow aktif" is a hard `—` (no table): a REAL
          value that must stay visibly distinct from the pulsing skeletons around it (K-08). */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <PoolReachCard imm={denied ? null : imm} con={denied ? null : con}
          immStatus={denied ? "ready" : immediate.status} conStatus={denied ? "ready" : contactable.status} t={t} lang={lang} />
        <StatCard label={t.dashboard.lastProfile} {...freshKpi} hint={t.dashboard.lastProfileHint} computingLabel={t.dashboard.computing} />
        <StatCard label={t.dashboard.workflowActive} value={DASH} hint={t.dashboard.workflowActiveHint} />
        <StatCard label={t.dashboard.importDob} {...dobKpi} hint={t.dashboard.importDobHint} computingLabel={t.dashboard.computing} />
      </section>

      {/* ── Frozen pool vs live sources vs gap. Pool line = IMMEDIATE; per-source cards = SOURCES. ── */}
      {!denied && (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-[16px] font-bold text-ink">
              {t.dashboard.liveTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
            </h2>
            <p className="mt-1 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">{t.dashboard.liveNote}</p>
          </div>

          {/* Layer 1: the frozen pool (immediate). */}
          <div className="glass rounded-card p-5">
            {immediate.status === "ready" && imm ? (
              <p className="font-body text-[13px] text-ink-soft">
                {t.dashboard.poolLayerA}
                <span className="font-display text-[15px] font-bold text-ink">{formatCount(imm.audienceSize, lang)}</span>
                {t.dashboard.poolLayerB}
                <span className="font-semibold text-ink">{formatDate(imm.lastProfileAt, lang)}</span>
                {t.dashboard.poolLayerC}
              </p>
            ) : immediate.status === "error" ? (
              <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("immediate")} />
            ) : (
              <Skeleton className="h-4 w-3/4" label={t.dashboard.computing} />
            )}
          </div>

          {/* Layers 2+3: per live source as ONE table (D2) — total (live) + how many not yet pooled. */}
          {sources.status === "ready" && sources.data ? (
            <GapTable sources={sources.data.liveSources} t={t} lang={lang} />
          ) : sources.status === "error" ? (
            <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("sources")} />
          ) : (
            <div className="glass rounded-card p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="my-2 h-4 w-full" label={i === 0 ? t.dashboard.computing : undefined} />
              ))}
            </div>
          )}
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">{t.dashboard.gapWhy}</p>
          </Why>

          {/* Candidate card (SNAPSHOT) — deliberately AFTER the live gap, and it states plainly that
              it counts a DIFFERENT population (candNote in its <Why>), so the two are not misread as
              contradicting each other. From the MIRROR block (precompute). */}
          {mirrorB.status === "ready" && mirrorB.data ? (
            <CandidateCard candidates={mirrorB.data.candidates} fitco={mirrorB.data.fitco} t={t} lang={lang} mirrorAt={mirrorAt} />
          ) : mirrorB.status === "error" ? (
            <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("mirror")} />
          ) : (
            <div className="glass rounded-card p-5">
              <Skeleton className="h-4 w-40" label={t.dashboard.computing} />
              <Skeleton className="mt-3 h-8 w-24" />
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="my-2 h-3.5 w-full" />)}
            </div>
          )}
        </section>
      )}

      {/* ── Unit spread (snapshot / mirror). ───────────────────────────────────────────── */}
      {!denied && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[16px] font-bold text-ink">{t.dashboard.unitTitle}</h2>
            {mirrorAt && <FreshTag>{t.dashboard.freshSnapshot} · {formatDateTime(mirrorAt, lang)}</FreshTag>}
          </div>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.unitNote}</p>
          {mirrorStale && (
            <p className="tint-amber rounded-sm px-3 py-2 font-body text-[12px] leading-relaxed text-ink">
              {t.dashboard.staleA}{STALE_THRESHOLD_HOURS}{t.dashboard.staleB}
            </p>
          )}
          <div className="glass rounded-card p-5">
            {mirrorB.status === "ready" && mirrorB.data ? (
              <>
                <BarList lang={lang} scale="sqrt" barClass="bg-blue"
                  items={mirrorB.data.unitSpread.map((u) => ({ label: u.unit, value: u.profiles }))} />
                {/* D1: the sqrt-scale diagnostic moved behind <Why> — collapsed, not deleted. */}
                <div className="mt-3"><Why><p className="text-[11px] leading-relaxed text-ink-soft">{t.dashboard.unitScaleNote}</p></Why></div>
              </>
            ) : mirrorB.status === "error" ? (
              <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("mirror")} />
            ) : (
              <SkelBars rows={6} label={t.dashboard.computing} />
            )}
          </div>
        </section>
      )}

      {/* ── Event registrations (live). ───────────────────────────────────────────────── */}
      {!denied && (
        <section className="space-y-3">
          <h2 className="font-display text-[16px] font-bold text-ink">
            {t.dashboard.eventTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h2>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.eventNote}</p>
          <div className="glass rounded-card p-5">
            {events.status === "ready" ? (
              <>
                <BarList lang={lang} scale="linear" barClass="bg-green"
                  items={shownEvents.map((e) => ({ label: e.product, value: e.registrations }))} />
                {hiddenEventCount > 0 && (
                  <button type="button" onClick={() => setShowAllEvents((v) => !v)}
                    className="mt-3 font-display text-[12px] font-semibold text-blue underline underline-offset-2">
                    {showAllEvents ? t.dashboard.eventShowTop : `${t.dashboard.eventShowAllA}${formatCount(hiddenEventCount, lang)}${t.dashboard.eventShowAllB}`}
                  </button>
                )}
              </>
            ) : events.status === "error" ? (
              <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("events")} />
            ) : (
              <SkelBars rows={EVENT_TOP} label={t.dashboard.computing} />
            )}
          </div>
        </section>
      )}

      {/* ── Contact coverage (live, immediate block). ─────────────────────────────────── */}
      {!denied && (
        <section className="space-y-3">
          <h2 className="font-display text-[16px] font-bold text-ink">
            {t.dashboard.coverageTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h2>
          <div className="glass rounded-card p-5">
            {immediate.status === "ready" && cov ? (
              <>
                <BarList lang={lang} scale="linear" barClass="bg-blue"
                  items={[
                    { label: t.dashboard.coverageBoth, value: cov.both },
                    { label: t.dashboard.coverageEmailOnly, value: cov.emailOnly },
                    { label: t.dashboard.coveragePhoneOnly, value: cov.phoneOnly },
                    { label: t.dashboard.coverageNeither, value: cov.neither },
                  ]} />

                {/* Per-category CSV export — through the existing engine. A zero category (neither) is
                    a DISABLED button ("nothing to export"), never an empty file; its row still shows. */}
                <div className="mt-4 border-t border-glass-border pt-3">
                  <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.coverageExportTitle}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([
                      ["both", t.dashboard.coverageBoth, cov.both],
                      ["emailOnly", t.dashboard.coverageEmailOnly, cov.emailOnly],
                      ["phoneOnly", t.dashboard.coveragePhoneOnly, cov.phoneOnly],
                      ["neither", t.dashboard.coverageNeither, cov.neither],
                    ] as [CoverageCat, string, number][]).map(([cat, label, value]) => (
                      <Button
                        key={cat}
                        size="sm"
                        variant="outline"
                        disabled={value === 0 || exportBusy !== null}
                        onClick={() => exportCoverage(cat)}
                        title={value === 0 ? t.dashboard.coverageExportEmpty : undefined}
                      >
                        {t.dashboard.coverageExportBtn} · {label} ({formatCount(value, lang)})
                        {exportBusy === cat ? ` — ${t.dashboard.coverageExportBusy}` : ""}
                      </Button>
                    ))}
                  </div>
                  {cov.phoneOnly > 0 && (
                    <p className="mt-2 font-body text-[11px] leading-relaxed text-amber">{t.dashboard.coveragePhoneOnlyWarn}</p>
                  )}
                  {exportMsg && <p className="mt-2 font-body text-[12px] text-red">{exportMsg}</p>}
                  <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-faint">{t.dashboard.coverageExportNote}</p>
                </div>

                {/* D1: the WhatsApp/phone caveat moved behind <Why> — collapsed, not deleted. */}
                <div className="mt-3"><Why><p className="text-[11px] leading-relaxed text-ink-soft">{t.dashboard.coveragePhoneNote}</p></Why></div>
              </>
            ) : immediate.status === "error" ? (
              <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("immediate")} />
            ) : (
              <SkelBars rows={4} label={t.dashboard.computing} />
            )}
          </div>
        </section>
      )}

      {/* ── RFM spread — SNAPSHOT, from the cermin precompute (dashboard_stats.rfm). 0 = measured
          zero (K-08); zero buckets are re-expanded from the closed vocabulary so none vanish. ──── */}
      {!denied && (
        <section className="space-y-2">
          <h2 className="font-display text-[15px] font-semibold text-ink-soft">
            {t.dashboard.rfmTitle} <FreshTag>{t.dashboard.freshSnapshot}{mirrorAt ? ` · ${formatDateTime(mirrorAt, lang)}` : ""}</FreshTag>
          </h2>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.rfmNote}</p>
          {mirrorB.status === "ready" && mirrorB.data ? (
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {mirrorB.data.importRfm.map((r) => (
                <div key={r.value} className="glass rounded-card p-4">
                  <div className="font-display text-[24px] font-bold leading-none text-ink">{formatCount(r.count, lang)}</div>
                  <div className="mt-1 font-mono text-[11px] text-ink-faint">{r.value === "-" ? t.dashboard.rfmNoBucket : r.value}</div>
                </div>
              ))}
            </div>
          ) : mirrorB.status === "error" ? (
            <BlockFail t={t} onRetry={isPreview ? undefined : () => loadBlock("mirror")} />
          ) : (
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="glass rounded-card p-4">
                  <Skeleton className="h-6 w-16" label={i === 0 ? t.dashboard.computing : undefined} />
                  <Skeleton className="mt-2 h-3 w-12" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
