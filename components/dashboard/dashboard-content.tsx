"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Mail, Phone, ShieldAlert, TrendingUp, TrendingDown } from "lucide-react";
import { BarList } from "./bar-list";
import { GrowthChart, type GrowthPoint } from "./growth-chart";
import type { BodSnapshot, Load } from "@/lib/crm/bod-snapshot";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";

interface ContactCoverage { both: number; emailOnly: number; phoneOnly: number; neither: number }

interface ImmediateBlock {
  audienceSize: number;
  contactCoverage: ContactCoverage;
  thisMonthCount: number;
  suppressedEmailCount: number;
}

interface DeliveryBlock {
  delivered: number;
  queued: number;
  softBounce: number;
  hardBounce: number;
  bounceRate: number;
  totalSent: number;
  totalBounced: number;
}

interface EventsBlock { eventRegistrations: { product: string; registrations: number }[] }

/** From c360-api /api/crm-summary — the same database as Customer 360 / admin.20fit.id/data. */
interface Audience360Block {
  loadedAt: string | null;
  total: number;
  email: number;
  phone: number;
  newThisMonth: number;
  coverage: ContactCoverage;
  growth: { month: string; added: number; total: number }[];
  topEvents: { name: string; people: number }[];
}

type BlockName = "immediate" | "events" | "delivery" | "audience360";
type Status = "loading" | "ready" | "error" | "denied";
interface Block<T> { status: Status; data: T | null }

const EVENT_TOP = 5;

function loadsToCumulative(loads: Load[]): GrowthPoint[] {
  if (loads.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const l of loads) {
    const day = l.at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + l.count);
  }
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let cumulative = 0;
  return days.map(([date, added]) => {
    cumulative += added;
    return { date, total: cumulative, added };
  });
}

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

function KpiCard({
  label, value, sub, icon, loading, error, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  loading?: boolean;
  error?: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
        <span className="text-ink-faint" aria-hidden>{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-[30px] w-2/3" />
      ) : error ? (
        <p className="mt-3 font-body text-[13px] font-semibold text-red">{error}</p>
      ) : (
        <>
          <p className="mt-3 font-display text-[30px] font-bold leading-none tabular-nums text-ink">{value}</p>
          {sub && (
            <p className={`mt-1.5 flex items-center gap-1 font-mono text-[12px] ${tone === "green" ? "text-green" : tone === "red" ? "text-red" : "text-ink-faint"}`}>
              {tone === "green" && <TrendingUp className="h-3 w-3" />}
              {tone === "red" && <TrendingDown className="h-3 w-3" />}
              {sub}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const colour = tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : tone === "red" ? "text-red" : "text-ink";
  return (
    <div className="rounded-lg bg-surface-2 p-4">
      <p className={`font-display text-[22px] font-bold leading-none tabular-nums ${colour}`}>{value}</p>
      <p className="mt-1.5 font-body text-[12px] text-ink-soft">{label}</p>
    </div>
  );
}

export function DashboardContent({
  summary,
}: {
  summary?: BodSnapshot | null;
  nowMs?: number;
} = {}) {
  const { lang, t } = useI18n();

  const [immediate, setImmediate] = useState<Block<ImmediateBlock>>({ status: "loading", data: null });
  const [events, setEvents] = useState<Block<EventsBlock>>({ status: "loading", data: null });
  const [delivery, setDelivery] = useState<Block<DeliveryBlock>>({ status: "loading", data: null });
  const [a360, setA360] = useState<Block<Audience360Block>>({ status: "loading", data: null });

  type Setter = (b: Block<unknown>) => void;
  const setters: Record<BlockName, Setter> = {
    immediate: setImmediate as Setter,
    events: setEvents as Setter,
    delivery: setDelivery as Setter,
    audience360: setA360 as Setter,
  };

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
    const ac = new AbortController();
    (["audience360", "immediate", "events", "delivery"] as BlockName[]).forEach((n) => loadBlock(n, ac.signal));
    return () => ac.abort();
  }, [loadBlock]);

  const denied = immediate.status === "denied" || a360.status === "denied";
  const imm = immediate.data;
  const all = a360.data;
  // Audience numbers come from the 20FIT database (all sources). If c360-api is unreachable the
  // CRM's own pool numbers are shown instead, so the Dashboard never goes blank.
  const useAll = a360.status === "ready" && !!all;
  const audienceStatus: Status = useAll ? "ready" : a360.status === "loading" ? "loading" : immediate.status;

  const totalKontak = useAll ? all!.total : imm?.audienceSize ?? 0;
  const cov: ContactCoverage | null = useAll ? all!.coverage : imm?.contactCoverage ?? null;
  const emailCount = useAll ? all!.email : cov ? cov.both + cov.emailOnly : 0;
  const phoneCount = useAll ? all!.phone : cov ? cov.both + cov.phoneOnly : 0;
  const pctOf = (n: number) => (totalKontak > 0 ? ((n / totalKontak) * 100).toFixed(1) : "0");
  const suppressedCount = imm?.suppressedEmailCount ?? 0;
  const thisMonthCount = useAll ? all!.newThisMonth : imm?.thisMonthCount ?? 0;
  const monthPct = pctOf(thisMonthCount);

  const growthPoints: GrowthPoint[] = useAll
    ? all!.growth.map((g) => ({ date: `${g.month}-01`, total: g.total, added: g.added }))
    : summary ? loadsToCumulative(summary.loads) : [];

  const topEventItems = useAll
    ? all!.topEvents.slice(0, EVENT_TOP).map((e) => ({ label: e.name, value: e.people }))
    : (events.data?.eventRegistrations ?? []).slice(0, EVENT_TOP).map((e) => ({ label: e.product, value: e.registrations }));
  const eventsStatus: Status = useAll ? "ready" : a360.status === "loading" ? "loading" : events.status;

  const del = delivery.data;
  const dataAt = all?.loadedAt
    ? new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(all.loadedAt))
    : null;

  const todayLabel = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(new Date());

  const d = t.dashboard;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{d.title}</h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">{d.subtitle}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[12px] text-ink-faint">{d.todayLabel} · {todayLabel} · {d.tz}</p>
          {useAll && <p className="mt-1 font-body text-[12px] text-ink-faint">{d.sourceAll360.replace("{t}", dataAt ?? "—")}</p>}
        </div>
      </header>

      {denied && <p className="font-body text-[13px] text-ink-soft">{t.access.dashboardHidden}</p>}

      {/* ── KPI row ── */}
      {!denied && (
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            label={d.kpiTotalContacts}
            value={audienceStatus === "ready" ? formatCount(totalKontak, lang) : "—"}
            sub={audienceStatus === "ready" && thisMonthCount > 0 ? `+${formatCount(thisMonthCount, lang)} ${d.kpiThisMonth} (+${monthPct}%)` : undefined}
            tone={thisMonthCount > 0 ? "green" : undefined}
            icon={<Users className="h-4 w-4" />}
            loading={audienceStatus === "loading"}
            error={audienceStatus === "error" ? d.blockFailed : undefined}
          />
          <KpiCard
            label={d.kpiHasEmail}
            value={audienceStatus === "ready" ? formatCount(emailCount, lang) : "—"}
            sub={audienceStatus === "ready" ? `${pctOf(emailCount)}% ${d.kpiOfTotal}` : undefined}
            icon={<Mail className="h-4 w-4" />}
            loading={audienceStatus === "loading"}
            error={audienceStatus === "error" ? d.blockFailed : undefined}
          />
          <KpiCard
            label={d.kpiHasPhone}
            value={audienceStatus === "ready" ? formatCount(phoneCount, lang) : "—"}
            sub={audienceStatus === "ready" ? `${pctOf(phoneCount)}% ${d.kpiOfTotal}` : undefined}
            icon={<Phone className="h-4 w-4" />}
            loading={audienceStatus === "loading"}
            error={audienceStatus === "error" ? d.blockFailed : undefined}
          />
          <KpiCard
            label={d.kpiBounceRate}
            value={delivery.status === "ready" && del ? `${del.bounceRate.toFixed(1)}%` : "—"}
            sub={immediate.status === "ready" ? `~${formatCount(suppressedCount, lang)} ${d.kpiSuppressed}` : undefined}
            tone={del && del.totalBounced > 0 ? "red" : undefined}
            icon={<ShieldAlert className="h-4 w-4" />}
            loading={delivery.status === "loading"}
            error={delivery.status === "error" ? d.blockFailed : undefined}
          />
        </section>
      )}

      {/* ── Row 2: Growth + Delivery Health ── */}
      {!denied && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Growth chart */}
          <div className="card p-5">
            <h3 className="font-display text-[15px] font-bold text-ink">{d.panelGrowth}</h3>
            <p className="mt-1 font-body text-[12px] text-ink-faint">{useAll ? d.panelGrowthNote360 : d.panelGrowthNote}</p>
            <div className="mt-4">
              {growthPoints.length > 0 ? (
                <GrowthChart points={growthPoints} lang={lang} addedLabel={d.panelGrowthAdded} />
              ) : (
                <p className="py-8 text-center font-body text-[13px] text-ink-soft">{d.panelGrowthEmpty}</p>
              )}
            </div>
          </div>

          {/* Delivery health */}
          <div className="card p-5">
            <h3 className="font-display text-[15px] font-bold text-ink">{d.panelDelivery}</h3>
            <p className="mt-1 font-body text-[12px] text-ink-faint">{d.panelDeliveryNote}</p>
            <div className="mt-4">
              {delivery.status === "ready" && del ? (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label={d.deliveryDelivered} value={formatCount(del.delivered, lang)} tone="green" />
                  <MiniStat label={d.deliveryQueued} value={formatCount(del.queued, lang)} />
                  <MiniStat label={d.deliverySoftBounce} value={formatCount(del.softBounce, lang)} tone="amber" />
                  <MiniStat label={d.deliveryHardBounce} value={formatCount(del.hardBounce, lang)} tone="red" />
                </div>
              ) : delivery.status === "error" ? (
                <BlockFail t={t} onRetry={() => loadBlock("delivery")} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg bg-surface-2 p-4">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Row 3: Top Events + Contact Coverage ── */}
      {!denied && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top 5 events */}
          <div className="card p-5">
            <h3 className="font-display text-[15px] font-bold text-ink">{d.panelTopEvents}</h3>
            <p className="mt-1 font-body text-[12px] text-ink-faint">{useAll ? d.panelTopEventsNote360 : d.panelTopEventsNote}</p>
            <div className="mt-4">
              {eventsStatus === "ready" ? (
                topEventItems.length > 0 ? (
                  <BarList lang={lang} barClass="bg-green" items={topEventItems} />
                ) : (
                  <p className="py-8 text-center font-body text-[13px] text-ink-soft">{d.panelTopEventsEmpty}</p>
                )
              ) : eventsStatus === "error" ? (
                <BlockFail t={t} onRetry={() => loadBlock(useAll ? "audience360" : "events")} />
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: EVENT_TOP }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contact coverage */}
          <div className="card p-5">
            <h3 className="font-display text-[15px] font-bold text-ink">{d.panelCoverage}</h3>
            <p className="mt-1 font-body text-[12px] text-ink-faint">{d.panelCoverageNote}</p>
            <div className="mt-4">
              {audienceStatus === "ready" && cov ? (
                <BarList lang={lang} scale="linear"
                  items={[
                    { label: d.coverageBoth, value: cov.both, barClass: "bg-green" },
                    { label: d.coverageEmailOnly, value: cov.emailOnly, barClass: "bg-blue" },
                    { label: d.coveragePhoneOnly, value: cov.phoneOnly, barClass: "bg-amber" },
                    { label: d.coverageNeither, value: cov.neither, barClass: "bg-red" },
                  ].filter((item) => item.value > 0)} />
              ) : audienceStatus === "error" ? (
                <BlockFail t={t} onRetry={() => loadBlock("audience360")} />
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
