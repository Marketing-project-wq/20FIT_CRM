"use client";

import { useEffect, useState } from "react";
import { StatCard } from "./stat-card";
import { BarList } from "./bar-list";
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

interface DashboardStats {
  audienceSize: number;
  contactableMarketing: number;
  contactableService: number;
  lastProfileAt: string | null;
  importDob: number;
  importRfm: { value: string; count: number }[];
  contactCoverage: { both: number; emailOnly: number; phoneOnly: number; neither: number };
  unitSpread: UnitCount[];
  eventRegistrations: ProductCount[];
  liveSources: SourceGap[];
  mirror: { refreshedAt: string | null; rowCount: number | null };
}

const DASH = "—"; // "no source": nothing to measure
const LOADING = "…";
const EVENT_TOP = 10;
/** A mirror snapshot older than this reads as "may be behind" on screen. Chosen at 24h because the
 *  refresh is MANUAL (no schedule) and the source tables grow daily — a day-old snapshot is the
 *  point where the unit-spread figures can start to visibly trail the live sources, so it is where
 *  the operator should be nudged to refresh. Short enough to catch drift, long enough not to cry
 *  stale after every routine manual refresh. */
const STALE_THRESHOLD_HOURS = 24;

/** One small, CONSISTENT freshness marker per block — same faint mono line everywhere, so a reader
 *  can tell a live count from a mirror snapshot from a hand-measured dated figure at a glance
 *  (Freshness sprint). Kept to ONE line per block to avoid turning the screen back into captions. */
function FreshTag({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] font-normal text-ink-faint">· {children}</span>;
}

/** Dictionary label for a live-source key (source display names; not stored data values). */
function srcLabel(t: ReturnType<typeof useI18n>["t"], key: string): string {
  const d = t.dashboard;
  return key === "my20fit" ? d.srcMy20fit
    : key === "hyrox" ? d.srcHyrox
    : key === "arena" ? d.srcArena
    : key === "gym" ? d.srcGym
    : key === "clinic" ? d.srcClinic
    : key;
}

/**
 * Dashboard body. Numbers come from /api/dashboard (server-side, role-gated).
 *
 * THREE KINDS OF NUMBER, kept distinct on screen (Dashboard Visual sprint):
 *   - LIVE per request: pool size, contact coverage, live-source totals + gap.
 *   - SNAPSHOT (mirror): unit spread — shows refreshed_at, warns when stale.
 *   - The pool is a FROZEN snapshot itself (last load 31 Jul 2026, no ingestion) — never shown
 *     as a number that looks like it is still counting up.
 * And the K-08 rule stands: `0` = measured zero, `—` = no source. Never swapped.
 */
export function DashboardContent({ previewStats }: { previewStats?: DashboardStats } = {}) {
  const { lang, t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(previewStats ?? null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">(previewStats ? "ready" : "loading");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [exportBusy, setExportBusy] = useState<CoverageCat | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // Export a contact-coverage category via the ONE existing segment export engine (/api/exports).
  // The route enforces the role gate (approval/deny), excludes suppression, forbids NIK/clinical
  // columns, and writes export.performed AFTER the stream — none of it is rebuilt here.
  async function exportCoverage(cat: CoverageCat) {
    if (previewStats) return; // dev preview: no live export
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

  useEffect(() => {
    // Dev preview (app/dev/preview): render fixture data with NO fetch — /dev/* is 404 in prod.
    if (previewStats) return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { signal: ac.signal, cache: "no-store" });
        if (res.status === 403 || res.status === 401) { setState("denied"); return; }
        if (!res.ok) { setState("error"); return; }
        setStats((await res.json()) as DashboardStats);
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState("error");
      }
    })();
    return () => ac.abort();
  }, [previewStats]);

  const todayLabel = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(new Date());

  const sourced = (value: string): string =>
    state === "ready" ? value : state === "loading" ? LOADING : DASH;

  const audienceValue = sourced(stats ? formatCount(stats.audienceSize, lang) : DASH);
  const contactableMarketingValue = sourced(stats ? formatCount(stats.contactableMarketing, lang) : DASH);
  const contactableServiceValue = sourced(stats ? formatCount(stats.contactableService, lang) : DASH);
  const freshnessValue = sourced(stats ? formatDate(stats.lastProfileAt, lang) : DASH);
  const importDobValue = sourced(stats ? formatCount(stats.importDob, lang) : DASH);

  // Mirror snapshot age (for the unit-spread block).
  const mirrorAt = stats?.mirror.refreshedAt ?? null;
  const mirrorAgeHours = mirrorAt ? (Date.now() - new Date(mirrorAt).getTime()) / 3_600_000 : null;
  const mirrorStale = mirrorAgeHours != null && mirrorAgeHours > STALE_THRESHOLD_HOURS;

  const events = stats?.eventRegistrations ?? [];
  const shownEvents = showAllEvents ? events : events.slice(0, EVENT_TOP);
  const hiddenEventCount = Math.max(events.length - EVENT_TOP, 0);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{t.dashboard.title}</h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">{t.dashboard.subtitle}</p>
        </div>
        {/* Prefixed with "Today" so this reads as the current date, NOT when the data was refreshed
            (each data block carries its own freshness marker below). */}
        <p className="font-mono text-[12px] text-ink-faint">{t.dashboard.todayLabel} · {todayLabel} · {t.dashboard.tz}</p>
      </header>

      {state === "denied" && <p className="font-body text-[13px] text-ink-soft">{t.access.dashboardHidden}</p>}
      {state === "error" && <p className="font-body text-[13px] text-ink-soft">{t.access.loadFailed}</p>}

      {/* KPI cards. Pool size is a FROZEN snapshot — the note ties it to the last load date. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t.dashboard.audienceSize} value={audienceValue} hint={t.dashboard.audienceSizeHint} />
        <StatCard label={t.dashboard.contactableMarketing} value={contactableMarketingValue} hint={t.dashboard.contactableMarketingHint} />
        <StatCard label={t.dashboard.contactableService} value={contactableServiceValue} hint={t.dashboard.contactableServiceHint} />
        <StatCard label={t.dashboard.lastProfile} value={freshnessValue} hint={t.dashboard.lastProfileHint} />
        {/* Hard em-dash: no workflow table exists at all — a 0 would read as "checked, none active". */}
        <StatCard label={t.dashboard.workflowActive} value={DASH} hint={t.dashboard.workflowActiveHint} />
        <StatCard label={t.dashboard.importDob} value={importDobValue} hint={t.dashboard.importDobHint} />
      </section>

      {/* ── Frozen pool vs live sources vs gap (the sprint's core). ─────────────────────── */}
      {state === "ready" && stats && (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-[16px] font-bold text-ink">
              {t.dashboard.liveTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
            </h2>
            <p className="mt-1 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">{t.dashboard.liveNote}</p>
          </div>

          {/* Layer 1: the frozen pool. */}
          <div className="glass rounded-card p-5">
            <p className="font-body text-[13px] text-ink-soft">
              {t.dashboard.poolLayerA}
              <span className="font-display text-[15px] font-bold text-ink">{formatCount(stats.audienceSize, lang)}</span>
              {t.dashboard.poolLayerB}
              <span className="font-semibold text-ink">{formatDate(stats.lastProfileAt, lang)}</span>
              {t.dashboard.poolLayerC}
            </p>
          </div>

          {/* Layers 2+3: per live source — total (live) and how many are not yet in the pool. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.liveSources.map((s) => (
              <div key={s.key} className="glass rounded-card p-4">
                <p className="font-body text-[13px] font-semibold text-ink">{srcLabel(t, s.key)}</p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-body text-[12px] text-ink-faint">{t.dashboard.totalLabel}</span>
                  <span className="font-display text-[18px] font-bold tabular-nums text-ink">{formatCount(s.total, lang)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="font-body text-[12px] text-ink-faint">{t.dashboard.gapLabel}</span>
                  <span className={`font-display text-[18px] font-bold tabular-nums ${s.gap > 0 ? "text-amber" : "text-ink"}`}>
                    {formatCount(s.gap, lang)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">{t.dashboard.gapWhy}</p>
          </Why>
        </section>
      )}

      {/* ── Unit spread (snapshot / mirror). ───────────────────────────────────────────── */}
      {state === "ready" && stats && stats.unitSpread.length > 0 && (
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
            <BarList lang={lang} scale="sqrt" barClass="bg-blue"
              items={stats.unitSpread.map((u) => ({ label: u.unit, value: u.profiles }))} />
            <p className="mt-3 font-body text-[11px] leading-relaxed text-ink-faint">{t.dashboard.unitScaleNote}</p>
          </div>
        </section>
      )}

      {/* ── Event registrations (live). ───────────────────────────────────────────────── */}
      {state === "ready" && stats && events.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-[16px] font-bold text-ink">
            {t.dashboard.eventTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h2>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.eventNote}</p>
          <div className="glass rounded-card p-5">
            <BarList lang={lang} scale="linear" barClass="bg-green"
              items={shownEvents.map((e) => ({ label: e.product, value: e.registrations }))} />
            {hiddenEventCount > 0 && (
              <button type="button" onClick={() => setShowAllEvents((v) => !v)}
                className="mt-3 font-display text-[12px] font-semibold text-blue underline underline-offset-2">
                {showAllEvents ? t.dashboard.eventShowTop : `${t.dashboard.eventShowAllA}${formatCount(hiddenEventCount, lang)}${t.dashboard.eventShowAllB}`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Contact coverage (live). ──────────────────────────────────────────────────── */}
      {state === "ready" && stats && (
        <section className="space-y-3">
          <h2 className="font-display text-[16px] font-bold text-ink">
            {t.dashboard.coverageTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h2>
          <div className="glass rounded-card p-5">
            <BarList lang={lang} scale="linear" barClass="bg-blue"
              items={[
                { label: t.dashboard.coverageBoth, value: stats.contactCoverage.both },
                { label: t.dashboard.coverageEmailOnly, value: stats.contactCoverage.emailOnly },
                { label: t.dashboard.coveragePhoneOnly, value: stats.contactCoverage.phoneOnly },
                { label: t.dashboard.coverageNeither, value: stats.contactCoverage.neither },
              ]} />

            {/* Per-category CSV export — through the existing engine. A zero category (neither) is a
                DISABLED button ("nothing to export"), never an empty file that reads as a failure;
                its row still shows above (K-08). */}
            <div className="mt-4 border-t border-glass-border pt-3">
              <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{t.dashboard.coverageExportTitle}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ["both", t.dashboard.coverageBoth, stats.contactCoverage.both],
                  ["emailOnly", t.dashboard.coverageEmailOnly, stats.contactCoverage.emailOnly],
                  ["phoneOnly", t.dashboard.coveragePhoneOnly, stats.contactCoverage.phoneOnly],
                  ["neither", t.dashboard.coverageNeither, stats.contactCoverage.neither],
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
              {stats.contactCoverage.phoneOnly > 0 && (
                <p className="mt-2 font-body text-[11px] leading-relaxed text-amber">{t.dashboard.coveragePhoneOnlyWarn}</p>
              )}
              {exportMsg && <p className="mt-2 font-body text-[12px] text-red">{exportMsg}</p>}
              <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-faint">{t.dashboard.coverageExportNote}</p>
            </div>

            <p className="mt-3 font-body text-[11px] leading-relaxed text-ink-faint">{t.dashboard.coveragePhoneNote}</p>
          </div>
        </section>
      )}

      {/* ── RFM spread (live, from staging). A distribution; 0 = measured zero (K-08). ──── */}
      {state === "ready" && stats && stats.importRfm.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-[15px] font-semibold text-ink-soft">
            {t.dashboard.rfmTitle} <FreshTag>{t.dashboard.freshLive}</FreshTag>
          </h2>
          <p className="max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.rfmNote}</p>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.importRfm.map((r) => (
              <div key={r.value} className="glass rounded-card p-4">
                <div className="font-display text-[24px] font-bold leading-none text-ink">{formatCount(r.count, lang)}</div>
                <div className="mt-1 font-mono text-[11px] text-ink-faint">{r.value === "-" ? t.dashboard.rfmNoBucket : r.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
