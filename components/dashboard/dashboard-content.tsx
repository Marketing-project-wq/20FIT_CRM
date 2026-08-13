"use client";

import { useEffect, useState } from "react";
import { StatCard } from "./stat-card";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatDate } from "@/lib/i18n";

interface DashboardStats {
  audienceSize: number;
  contactableMarketing: number;
  contactableService: number;
  lastProfileAt: string | null;
  importDob: number;
  importRfm: { value: string; count: number }[];
}

const DASH = "—"; // "no source": this figure has nothing to measure
const LOADING = "…";

/**
 * Dashboard body. Numbers come from /api/dashboard (server-side, role-gated).
 *
 * THE ONE RULE THIS SCREEN ENFORCES:
 *   `0`  = "measured, and the answer is zero"   (contactable — a legal fact)
 *   `—`  = "no source to measure yet"           (active workflows — no table exists)
 * They are never swapped. A `0` for something with no source is a lie that looks like data.
 * (Sprint 4B: strings + number/date formatting now follow the chosen language; the 0-vs-—
 * distinction and every figure are unchanged.)
 */
export function DashboardContent() {
  const { lang, t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { signal: ac.signal, cache: "no-store" });
        if (res.status === 403 || res.status === 401) {
          setState("denied");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        setStats((await res.json()) as DashboardStats);
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState("error");
      }
    })();
    return () => ac.abort();
  }, []);

  const todayLabel = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  // Sourced cards: show the real value only when ready; loading -> …, otherwise -> —.
  const sourced = (value: string): string =>
    state === "ready" ? value : state === "loading" ? LOADING : DASH;

  const audienceValue = sourced(stats ? formatCount(stats.audienceSize, lang) : DASH);
  const contactableMarketingValue = sourced(stats ? formatCount(stats.contactableMarketing, lang) : DASH);
  const contactableServiceValue = sourced(stats ? formatCount(stats.contactableService, lang) : DASH);
  const freshnessValue = sourced(stats ? formatDate(stats.lastProfileAt, lang) : DASH);
  const importDobValue = sourced(stats ? formatCount(stats.importDob, lang) : DASH);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.dashboard.title}</h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">{t.dashboard.subtitle}</p>
        </div>
        <p className="font-mono text-[12px] text-ink-faint">{todayLabel} · {t.dashboard.tz}</p>
      </header>

      {state === "denied" && (
        <p className="font-body text-[13px] text-ink-soft">{t.access.dashboardHidden}</p>
      )}
      {state === "error" && (
        <p className="font-body text-[13px] text-ink-soft">{t.access.loadFailed}</p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t.dashboard.audienceSize} value={audienceValue} hint={t.dashboard.audienceSizeHint} />
        <StatCard label={t.dashboard.contactableMarketing} value={contactableMarketingValue} hint={t.dashboard.contactableMarketingHint} />
        <StatCard label={t.dashboard.contactableService} value={contactableServiceValue} hint={t.dashboard.contactableServiceHint} />
        {/* Hard em-dash: no workflow table exists at all. A 0 here would read as "checked, none
            active" — but it has never been checked, because there is nothing to check. */}
        <StatCard label={t.dashboard.workflowActive} value={DASH} hint={t.dashboard.workflowActiveHint} />
        <StatCard label={t.dashboard.lastProfile} value={freshnessValue} hint={t.dashboard.lastProfileHint} />
        {/* Sprint 3Y: staging_20fit_data carries a birth date master_customer never got. */}
        <StatCard label={t.dashboard.importDob} value={importDobValue} hint={t.dashboard.importDobHint} />
      </section>

      {/* RFM spread. A distribution, not a single KPI. 0 = measured zero (K-08); the stored
          misspelling "Campion user" is a data value and is never translated. */}
      {state === "ready" && stats && stats.importRfm.length > 0 && (
        <section>
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            {t.dashboard.rfmTitle}
          </h2>
          <p className="mt-1 max-w-3xl font-body text-[12px] leading-relaxed text-ink-faint">{t.dashboard.rfmNote}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.importRfm.map((r) => (
              <div key={r.value} className="glass rounded-card p-4">
                <div className="font-display text-[26px] font-black leading-none text-ink">{formatCount(r.count, lang)}</div>
                <div className="mt-1 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {r.value === "-" ? t.dashboard.rfmNoBucket : r.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
