"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Cake } from "lucide-react";
import { StatCard } from "./stat-card";
import { BarList } from "./bar-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Why } from "@/components/ui/why";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatDate, formatDateTime } from "@/lib/i18n";

interface SourceGap { key: string; total: number; inPool: number; gap: number }
interface UnitCount { unit: string; profiles: number; source: "mirror" | "live" }
interface ProductCount { product: string; registrations: number }
interface ContactCoverage { both: number; emailOnly: number; phoneOnly: number; neither: number }
interface MirrorMeta { refreshedAt: string | null; rowCount: number | null }
interface Candidates { total: number; bySource: { source: string; count: number }[] }
interface Fitco { matched: number; unmatched: number }

// The blocks the dashboard loads independently (mirror lib/crm/dashboard.ts server shapes).
interface ImmediateBlock { audienceSize: number; lastProfileAt: string | null; contactCoverage: ContactCoverage; importDob: number; workflowCount: number; workflowQueued: number; loads: Load[]; loadsTruncated: boolean }
// ReachBlock is retained ONLY as part of the DashboardStats fixture shape below; this operational
// layer no longer fetches or renders reach (it moved to the Director Summary, K-64).
interface ReachBlock { emailable: number; whatsappable: number; poolTotal: number; everContacted: number }
interface Load { at: string; count: number }
interface MirrorBlock { unitSpread: UnitCount[]; importRfm: { value: string; count: number }[]; candidates: Candidates; fitco: Fitco; mirror: MirrorMeta }
interface EventsBlock { eventRegistrations: ProductCount[] }
interface SourcesBlock { liveSources: SourceGap[] }

/** The whole-page fixture shape (dev preview) — the union of every block. */
export interface DashboardStats extends ImmediateBlock, ReachBlock, MirrorBlock, EventsBlock, SourcesBlock {}

// `reach` (live emailable/whatsappable) is intentionally NOT a block here any more: the reach card
// was a duplicate of the summary's "Jangkauan" card, so it moved UP to the Director Summary (read
// from the daily snapshot) and its live block is no longer fetched by this operational layer (K-64).
type BlockName = "immediate" | "mirror" | "events" | "sources";
type Status = "loading" | "ready" | "error" | "denied";
interface Block<T> { status: Status; data: T | null }

const DASH = "—"; // "no source": nothing to measure (K-08). NEVER a loading state.
const EVENT_TOP = 10;

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

/** Split a full fixture into the four operational blocks (dev preview all-ready path). */
function blocksFromStats(s: DashboardStats) {
  return {
    immediate: { audienceSize: s.audienceSize, lastProfileAt: s.lastProfileAt, contactCoverage: s.contactCoverage, importDob: s.importDob, workflowCount: s.workflowCount, workflowQueued: s.workflowQueued, loads: s.loads, loadsTruncated: s.loadsTruncated } as ImmediateBlock,
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

// NOTE: the pool + reach SUMMARY card ("Pool & jangkauan") that stood here was the operational
// duplicate of the Director Summary's "Jangkauan" card. It moved UP to the summary (read from the
// daily snapshot, alongside "Sudah pernah dikirimi"), so it is gone from this operational layer and
// no longer rendered twice on the one page (K-64). The `reach` block is no longer fetched here.

/** D2 — the five live-source gaps as ONE compact table instead of five cards. */
function GapTable({ sources, t, lang }: { sources: SourceGap[]; t: Dict; lang: Lang }) {
  return (
    <div className="card overflow-x-auto p-1">
      <table className="w-full min-w-[22rem] border-collapse">
        <thead>
          <tr className="border-b border-surface-border text-left">
            <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.gapTableSource}</th>
            <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.totalLabel}</th>
            <th className="px-3 py-2 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.gapLabel}</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.key} className="border-b border-surface-border/60 last:border-0">
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
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[14px] font-bold text-ink">{t.dashboard.candTitle}</h3>
        {mirrorAt && <FreshTag>{t.dashboard.freshSnapshot} · {formatDateTime(mirrorAt, lang)}</FreshTag>}
      </div>
      <p className="mt-2 font-display text-[30px] font-black leading-none text-ink">{formatCount(candidates.total, lang)}</p>
      <p className="mt-1 font-mono text-[11px] text-amber">{t.dashboard.candLabel}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[18rem] border-collapse">
          <thead>
            <tr className="border-b border-surface-border text-left">
              <th className="px-2 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.candSourceCol}</th>
              <th className="px-2 py-1.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.candCountCol}</th>
            </tr>
          </thead>
          <tbody>
            {candidates.bySource.map((r) => (
              <tr key={r.source} className="border-b border-surface-border/60 last:border-0">
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
      mirror: mk<MirrorBlock>("mirror", derived?.mirror ?? null),
      events: mk<EventsBlock>("events", derived?.events ?? null),
      sources: mk<SourcesBlock>("sources", derived?.sources ?? null),
    };
  };

  const [immediate, setImmediate] = useState<Block<ImmediateBlock>>(() => initBlocks().immediate);
  const [mirrorB, setMirrorB] = useState<Block<MirrorBlock>>(() => initBlocks().mirror);
  const [events, setEvents] = useState<Block<EventsBlock>>(() => initBlocks().events);
  const [sources, setSources] = useState<Block<SourcesBlock>>(() => initBlocks().sources);

  const [showAllEvents, setShowAllEvents] = useState(false);

  const setters: Record<BlockName, (b: Block<unknown>) => void> = {
    immediate: setImmediate as (b: Block<unknown>) => void,
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
    (["immediate", "mirror", "events", "sources"] as BlockName[]).forEach((n) => loadBlock(n, ac.signal));
    return () => ac.abort();
  }, [isPreview, loadBlock]);

  const todayLabel = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(new Date());

  // A role without list access gets 403 on every block; the immediate block is the sentinel.
  const denied = immediate.status === "denied";

  // KPI value/state helpers, per source block.
  const imm = immediate.data;
  // ── Captions rendered FROM DATA (K-60) ────────────────────────────────────────────────────
  // The workflow caption used to be a sentence in the translation file stating a fact ("no workflow
  // table yet"); it was true when written and false by the time anyone read it again. A translation
  // file is not a place to keep a fact — nothing re-checks it, so it is computed here. (The load-
  // history caption that also lived here went UP with the growth card, which the Director Summary
  // now owns as bars — K-64.)
  const workflowHint = imm == null
    ? undefined
    : imm.workflowQueued > 0
      ? t.dashboard.workflowActiveHint.replace("{count}", formatCount(imm.workflowQueued, lang))
      : t.dashboard.workflowActiveHintEmpty;

  const kpi = (blockStatus: Status, value: string) => ({
    value,
    loading: !denied && blockStatus === "loading",
    errorLabel: !denied && blockStatus === "error" ? t.dashboard.blockFailed : undefined,
  });

  const dobKpi = kpi(immediate.status, denied ? DASH : imm ? formatCount(imm.importDob, lang) : DASH);

  // Mirror snapshot freshness — shown as the timestamp on the snapshot-backed sections (candidate
  // card + customer-tier spread). The unit-spread block that also read it moved to the summary.
  const mirrorAt = mirrorB.data?.mirror.refreshedAt ?? null;

  const eventList = events.data?.eventRegistrations ?? [];
  const shownEvents = showAllEvents ? eventList : eventList.slice(0, EVENT_TOP);
  const hiddenEventCount = Math.max(eventList.length - EVENT_TOP, 0);

  const cov = imm?.contactCoverage ?? null;

  return (
    <div className="space-y-10">
      {/* FIXTURE PREVIEW MARKER — renders inside the dashboard itself (not just at the /dev/preview
          URL) so ANY screenshot of fixture data is unmistakable without checking the database. It
          only ever shows when isPreview is true, which is only ever true on /dev/preview (404 in
          prod). This closes the trap where the corrected-to-real fixture became indistinguishable
          from production (see docs/riwayat/TEMUAN.md). */}
      {isPreview && (
        <div className="tint-amber flex items-center gap-2 rounded-sm border border-amber px-3 py-2" role="note">
          <span aria-hidden className="font-display text-[14px] font-bold">⚠</span>
          <span className="font-mono text-[12px] font-bold uppercase tracking-wide">{t.dashboard.previewBanner}</span>
        </div>
      )}
      {/* Operational layer header — this section's OWN title and OWN timestamp (K-64). The summary
          above carries one daily snapshot time; here the freshness is MIXED and each part names its
          own, so this header states that plainly rather than implying one time for the whole thing. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[24px] font-extrabold leading-none text-ink">{t.dashboard.opsTitle}</h2>
          <p className="mt-2 font-body text-[14px] text-ink-soft">{t.dashboard.opsSubtitle}</p>
        </div>
        {/* Prefixed with "Today" so this reads as the current date — when these figures were
            computed — NOT the summary's daily snapshot time above. */}
        <p className="font-mono text-[12px] text-ink-faint">{t.dashboard.todayLabel} · {todayLabel} · {t.dashboard.tz}</p>
      </header>

      {denied && <p className="font-body text-[13px] text-ink-soft">{t.access.dashboardHidden}</p>}

      {/* KPI row. The pool + reach summary card and the "Profil terakhir bertambah" (load-history)
          card were operational duplicates of the summary's Jangkauan and Pertumbuhan cards — both
          moved UP (K-64), so this row now carries only what the summary does NOT: total workflows and
          the manual date-of-birth figure. "Workflow" holds a REAL value that must stay visibly
          distinct from the pulsing skeletons around it (K-08). */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Was a hard `—` with the hint "no workflow table yet". crm_workflow has existed since
            27 Aug 2026 and holds people waiting in it — both figures are now counted (K-60). */}
        <StatCard
          label={t.dashboard.workflowActive}
          {...kpi(immediate.status, imm ? formatCount(imm.workflowCount, lang) : DASH)}
          hint={workflowHint}
          computingLabel={t.dashboard.computing}
          icon={<GitBranch className="h-4 w-4" />}
        />
        {/* The one figure on this screen that is NOT computed. It keeps its measurement date AND
            carries a visible manual badge, which is the condition K-60 puts on such a number. */}
        <StatCard
          label={t.dashboard.importDob}
          {...dobKpi}
          hint={t.dashboard.importDobHint}
          badge={t.dashboard.manualBadge}
          computingLabel={t.dashboard.computing}
          icon={<Cake className="h-4 w-4" />}
        />
      </section>

      {/* ── Frozen pool vs live sources vs gap. Pool line = IMMEDIATE; per-source cards = SOURCES. ── */}
      {!denied && (
        <section className="space-y-4">
          <div>
            <h3 className="font-display text-[16px] font-bold text-ink">
              {t.dashboard.liveTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
            </h3>
            <p className="mt-1 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">{t.dashboard.liveNote}</p>
          </div>

          {/* Layer 1: the frozen pool (immediate). */}
          <div className="card p-5">
            {immediate.status === "ready" && imm ? (
              <p className="font-body text-[13px] text-ink-soft">
                {t.dashboard.poolLayerA}
                <span className="font-display text-[15px] font-bold text-ink">{formatCount(imm.audienceSize, lang)}</span>
                {t.dashboard.poolLayerB}
                <span className="font-semibold text-ink">{formatDate(imm.lastProfileAt, lang)}</span>
                {t.dashboard.poolLayerC
                  .replace("{n}", formatCount(imm.loads.length, lang))
                  .replace("{date}", formatDate(imm.loads.length > 0 ? imm.loads[imm.loads.length - 1].at : null, lang))}
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
            <div className="card p-4">
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
            <div className="card p-5">
              <Skeleton className="h-4 w-40" label={t.dashboard.computing} />
              <Skeleton className="mt-3 h-8 w-24" />
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="my-2 h-3.5 w-full" />)}
            </div>
          )}
        </section>
      )}

      {/* NOTE: the business-unit spread ("Sebaran unit bisnis") that stood here was the operational
          duplicate of the Director Summary's "Di unit bisnis mana" card. It moved UP to the summary
          (K-64) and is no longer rendered on this page, so the two do not appear twice. The mirror
          block is still fetched for the candidate card + customer-tier spread below. */}

      {/* ── Event registrations (live). ───────────────────────────────────────────────── */}
      {!denied && (
        <section className="space-y-3">
          <h3 className="font-display text-[16px] font-bold text-ink">
            {t.dashboard.eventTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h3>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.eventNote}</p>
          <div className="card p-5">
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
          <h3 className="font-display text-[16px] font-bold text-ink">
            {t.dashboard.coverageTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h3>
          <div className="card p-5">
            {immediate.status === "ready" && cov ? (
              <>
                {/* Coverage is a reachability gradient, so the bars carry meaning: green = fully
                    reachable (both channels), amber = one channel only, red = unreachable. Numbers
                    unchanged. */}
                <BarList lang={lang} scale="linear"
                  items={[
                    { label: t.dashboard.coverageBoth, value: cov.both, barClass: "bg-green" },
                    { label: t.dashboard.coverageEmailOnly, value: cov.emailOnly, barClass: "bg-amber" },
                    { label: t.dashboard.coveragePhoneOnly, value: cov.phoneOnly, barClass: "bg-amber" },
                    { label: t.dashboard.coverageNeither, value: cov.neither, barClass: "bg-red" },
                  ]} />

                {/* Phone-only cohort caveat — a measurement note about the card (kept); the per-category
                    CSV export buttons were removed with the Exports feature (CSV was the only data exit
                    that did not honour unsubscribe). */}
                {cov.phoneOnly > 0 && (
                  <p className="mt-4 border-t border-surface-border pt-3 font-body text-[11px] leading-relaxed text-amber">{t.dashboard.coveragePhoneOnlyWarn}</p>
                )}

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
          <h3 className="font-display text-[15px] font-semibold text-ink-soft">
            {t.dashboard.rfmTitle} <FreshTag>{t.dashboard.freshSnapshot}{mirrorAt ? ` · ${formatDateTime(mirrorAt, lang)}` : ""}</FreshTag>
          </h3>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.rfmNote}</p>
          {mirrorB.status === "ready" && mirrorB.data ? (
            <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {mirrorB.data.importRfm.map((r) => (
                <div key={r.value} className="card p-4">
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
                <div key={i} className="card p-4">
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
