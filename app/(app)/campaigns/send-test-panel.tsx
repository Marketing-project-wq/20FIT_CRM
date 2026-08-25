"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import {
  runInternalSendTestAction,
  cleanupInternalSendTestAction,
  type InternalTestResult,
  type InternalTestCleanupResult,
} from "./actions";

/**
 * Pre-launch internal send-test panel. Rendered ONLY when real sending is off (the same condition the
 * harness enforces) — so it disappears the moment CAMPAIGN_SEND_ENABLED flips on, and can never be a
 * post-launch backdoor. One button drives the SAME send engine via a single injected internal
 * address; the result shows the real artifacts (log row + provider_message_id, campaign.sent audit
 * count, run) so what's proven is the chain.
 */
export function SendTestPanel() {
  const { lang, t } = useI18n();
  const st = t.campaignsPage.sendTest;
  const fmt = (n: number) => formatCount(n, lang);
  const [running, setRunning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<InternalTestResult | null>(null);
  const [cleanup, setCleanup] = useState<InternalTestCleanupResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const errText = (e: string | undefined): string => {
    switch (e) {
      case "denied": return st.errDenied;
      case "real_send_enabled": return st.errRealSend;
      case "no_target_configured": return st.errNoTarget;
      case "target_not_internal": return st.errNotInternal;
      case "template_seed_failed": return st.errTemplate;
      case "segment_seed_failed": return st.errSegment;
      case "run_create_failed": return st.errRun;
      default: return st.errRun;
    }
  };

  async function onRun() {
    setRunning(true);
    setNotice(null);
    setCleanup(null);
    try {
      const r = await runInternalSendTestAction();
      if (!r.ok) {
        setResult(null);
        if (r.error === "missing_env" && "missingEnv" in r && r.missingEnv?.length) {
          // Report ALL missing vars at once — the whole point of the pre-check (T-30).
          setNotice(`${st.errMissingEnv}${r.missingEnv.join(", ")}`);
        } else if (r.error === "send_threw" && "detail" in r) {
          setNotice(`${st.errSendThrew}${r.detail ?? ""}`);
        } else if (r.error === "unsubscribe_host_mismatch") {
          const hosts = "linkHost" in r ? ` (${r.linkHost ?? "?"} ≠ ${r.servingHost ?? "?"})` : "";
          setNotice(`${st.errHostMismatch}${hosts}`);
        } else {
          setNotice(errText(r.error));
        }
        return;
      }
      setResult(r);
    } catch {
      // A thrown server action would otherwise fail silently in the handler — the exact bug this
      // panel exists to end. Surface it.
      setResult(null);
      setNotice(st.errUnexpected);
    } finally {
      setRunning(false);
    }
  }

  async function onCleanup() {
    setCleaning(true);
    setNotice(null);
    try {
      const r = await cleanupInternalSendTestAction();
      if (!r.ok) {
        setNotice(errText((r as { error?: string }).error));
        return;
      }
      setCleanup(r);
    } finally {
      setCleaning(false);
    }
  }

  const ok = result?.ok ? result : null;

  return (
    <div className="glass-strong flex flex-col gap-4 rounded-card p-5">
      <div>
        <h2 className="font-body text-[13px] font-semibold text-ink">{st.title}</h2>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft">{st.desc}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onRun} disabled={running}>
          {running ? st.running : st.runBtn}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCleanup} disabled={cleaning}>
          {cleaning ? st.cleaning : st.cleanupBtn}
        </Button>
      </div>

      {notice && <p role="alert" className="font-body text-[13px] leading-relaxed text-red">{notice}</p>}

      {ok && (
        <div className="flex flex-col gap-3 rounded-card border border-glass-border p-4">
          <p className="font-body text-[13px] font-semibold text-ink">{st.resultTitle}</p>
          <div className="grid gap-2 font-body text-[13px] text-ink-soft sm:grid-cols-2">
            <div><span className="text-ink-faint">{st.target}:</span> <span className="text-ink">{ok.targetMasked}</span></div>
            <div><span className="text-ink-faint">{st.run}:</span> <span className="font-mono text-[12px] text-ink">{ok.runId}</span></div>
            <div><span className="text-ink-faint">{st.runStatus}:</span> <span className="text-ink">{ok.runStatus}</span></div>
            <div>
              <span className="text-ink-faint">{st.auditCount}:</span>{" "}
              <Badge tone={ok.auditCampaignSentCount === 1 ? "green" : "red"}>{fmt(ok.auditCampaignSentCount ?? 0)}</Badge>
            </div>
          </div>

          {/* Per-row log artifacts — the 7-point evidence, especially provider_message_id's real value. */}
          <div className="flex flex-col gap-2">
            {(ok.logRows ?? []).map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-sm border border-glass-border bg-glass px-3 py-2">
                <Badge tone={row.status === "sent" ? "green" : row.status === "skipped_suppressed" ? "blue" : "red"}>{row.status}</Badge>
                <span className="font-body text-[12px] text-ink-soft">{st.provider}:</span>
                {row.providerMessageId
                  ? <span className="font-mono text-[12px] text-ink">{row.providerMessageId}</span>
                  : <span className="font-body text-[12px] text-red">{st.providerNull}</span>}
                {row.failureCause && <span className="font-body text-[12px] text-red">({row.failureCause})</span>}
              </div>
            ))}
          </div>

          {ok.summary && (
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">{st.sent}: {fmt(ok.summary.sent)}</Badge>
              <Badge tone="neutral">{st.withheld}: {fmt(ok.summary.withheldPrelaunch ?? 0)}</Badge>
              <Badge tone="red">{st.failed}: {fmt(ok.summary.failed)}</Badge>
            </div>
          )}
        </div>
      )}

      {cleanup?.ok && (
        <div className="flex flex-col gap-1.5 rounded-card border border-glass-border p-4">
          <p className="font-body text-[13px] text-ink">{st.cleanupDone}{fmt(cleanup.segmentsArchived)}</p>
          <p className="font-body text-[12px] leading-relaxed text-ink-faint">
            <span className="font-semibold">{st.permanentTitle}.</span> {cleanup.note}
          </p>
        </div>
      )}
    </div>
  );
}
