import { loadActivityCoverage } from "@/lib/crm/activity";
import { getServerDict } from "@/lib/i18n/server";
import { formatCount, formatPct, formatDateTime } from "@/lib/i18n";
import { Activity } from "lucide-react";

/**
 * Activity-layer coverage panel (Fase 1). States honestly how many profiles carry a REAL activity
 * signal (joined_at / last_active_at from live source tables) out of the frozen master pool. This
 * is the gate for time-based segment criteria: they only apply to profiles counted here, and the
 * UI must say so plainly rather than imply the whole pool has activity dates (K-19 spirit).
 */
export async function ActivityCoveragePanel() {
  const { t, lang } = getServerDict();
  const a = t.activityCoverage;
  let cov;
  try {
    cov = await loadActivityCoverage();
  } catch {
    return null; // panel is additive; a read failure must not break the quality tab
  }
  const pct = cov.total > 0 ? cov.withActivity / cov.total : 0;

  return (
    <section className="glass rounded-card p-5">
      <div className="flex items-center gap-2 text-ink-soft">
        <Activity className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{a.title}</h2>
      </div>
      <p className="mt-2 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft">{a.intro}</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-card p-4">
          <p className="font-display text-[40px] font-black leading-none text-ink">{formatCount(cov.withActivity, lang)}</p>
          <p className="mt-1 font-body text-[12px] text-ink-faint">
            {a.ofTotalA}{formatCount(cov.total, lang)}{a.ofTotalB} · {formatPct(pct, lang)}
          </p>
        </div>
        <div className="glass rounded-card p-4">
          <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">{a.mostRecentLabel}</p>
          <p className="mt-2 font-body text-[15px] font-semibold text-ink">
            {cov.mostRecentActive ? formatDateTime(cov.mostRecentActive, lang) : "—"}
          </p>
          <p className="mt-1 font-body text-[11px] text-ink-faint">{a.mostRecentSub}</p>
        </div>
        <div className="glass rounded-card p-4">
          <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">{a.refreshedLabel}</p>
          <p className="mt-2 font-body text-[15px] font-semibold text-ink">
            {cov.refreshedAt ? formatDateTime(cov.refreshedAt, lang) : "—"}
          </p>
          <p className="mt-1 font-body text-[11px] text-ink-faint">{a.refreshedSub}</p>
        </div>
      </div>

      <p className="mt-4 font-body text-[12px] leading-relaxed text-amber">{a.caveat}</p>
    </section>
  );
}
