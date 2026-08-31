"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import { validateSendLimits, isLargeRaise, RAMP_STEPS, type SendLimits } from "@/lib/crm/send-limits";
import { setSendLimitsAction } from "@/app/(app)/settings/send-limits-actions";

const inputCls =
  "h-10 w-40 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/**
 * Super-Admin editor for the two send limits. The daily ceiling is a domain-REPUTATION control, not a
 * Mailtrap quota — so a large raise earns a one-time WARNING (never a block; rule c), the recommended
 * ramp is shown as a SUGGESTION (rule f), and the 5% bounce auto-stop is noted as always-on and
 * independent of this number (rule e).
 */
export function SendLimitsPanel({ initial }: { initial: SendLimits }) {
  const { lang, t } = useI18n();
  const s = t.sendLimitsPage;
  const fmt = (n: number) => formatCount(n, lang);

  const [daily, setDaily] = useState(String(initial.dailyLimit));
  const [workflow, setWorkflow] = useState(String(initial.workflowDailyCap));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const dailyN = Number(daily);
  const workflowN = Number(workflow);
  const valid = validateSendLimits({ dailyLimit: dailyN, workflowDailyCap: workflowN });
  // The reputation warning shows while the entered daily limit more than doubles the CURRENT stored one.
  const showWarning = Number.isFinite(dailyN) && isLargeRaise(initial.dailyLimit, dailyN);

  function errText(code: string | undefined): string {
    switch (code) {
      case "daily_invalid": return s.errDailyInvalid;
      case "workflow_invalid": return s.errWorkflowInvalid;
      case "cap_over_limit": return s.errCapOverLimit;
      case "denied": return s.errDenied;
      default: return s.saveFailed;
    }
  }

  async function onSave() {
    if (!valid.ok) { setNotice(errText(valid.error)); return; }
    setBusy(true); setNotice(null);
    try {
      const res = await setSendLimitsAction({ dailyLimit: Math.floor(dailyN), workflowDailyCap: Math.floor(workflowN) });
      setNotice(res.ok ? s.saved : errText(res.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{s.title}</h2>
        <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft">{s.intro}</p>
      </div>

      <div className="glass-strong flex flex-col gap-4 rounded-card p-5">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[13px] font-semibold text-ink">{s.dailyLabel}</span>
          <input type="number" min={1} className={inputCls} value={daily} onChange={(e) => { setDaily(e.target.value); setNotice(null); }} />
          <span className="font-body text-[12px] text-ink-faint">{s.dailyHint}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[13px] font-semibold text-ink">{s.workflowLabel}</span>
          <input type="number" min={1} className={inputCls} value={workflow} onChange={(e) => { setWorkflow(e.target.value); setNotice(null); }} />
          <span className="font-body text-[12px] text-ink-faint">{s.workflowHint}</span>
        </label>

        {!valid.ok && (daily !== "" && workflow !== "") && (
          <p role="alert" className="font-body text-[13px] text-red">{errText(valid.error)}</p>
        )}

        {/* Reputation warning — a WARNING, not a block. The owner may still save. */}
        {showWarning && valid.ok && (
          <div className="tint-amber flex gap-2 rounded-card p-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber" aria-hidden />
            <div>
              <p className="font-body text-[13px] font-semibold text-ink">{s.warnTitle}</p>
              <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">{s.warnBody}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={onSave} disabled={busy || !valid.ok}>{busy ? s.saving : s.save}</Button>
          {notice && <span className="font-body text-[13px] text-ink-soft">{notice}</span>}
        </div>
      </div>

      {/* Ramp recommendation — a SUGGESTION shown on screen, never enforced. */}
      <div className="glass rounded-card p-5">
        <p className="font-body text-[13px] font-semibold text-ink">{s.rampTitle}</p>
        <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">{s.rampBody}</p>
        <p className="mt-2 font-mono text-[12px] text-ink-faint">{RAMP_STEPS.map(fmt).join(" → ")}</p>
      </div>

      {/* Bounce auto-stop is independent of the daily limit and can't be turned off with it. */}
      <p className="font-body text-[12px] leading-relaxed text-ink-faint">{s.bounceNote}</p>
    </div>
  );
}
