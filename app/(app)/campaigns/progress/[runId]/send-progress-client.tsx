"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import { composeUrl } from "@/lib/crm/campaign-nav";
import { computeProgress, isRunTerminal, reduceProgress, type ProgressState, type PollOutcome } from "@/lib/crm/send-progress";
import { campaignProgressAction } from "../../actions";

const POLL_MS = 3000;

/**
 * Polls campaignProgressAction every 3s and renders live DB-sourced progress. NOTHING here is inferred
 * from a fetch failure: a poll that throws is retried, never rendered as "the send failed" (K-66). The
 * send status shown is always the run row's raw status.
 */
export function SendProgressClient({ runId, target, label }: { runId: string; target: number | null; label: string | null }) {
  const { t, lang } = useI18n();
  const p = t.campaignsPage.progress;

  const [state, setState] = useState<ProgressState>({ status: null, sent: 0, notFound: false });
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // forces a re-render each poll so rate/ETA recompute against now
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      // Every outcome — success, not-found, or a thrown/timed-out fetch — flows through reduceProgress,
      // which NEVER turns a dropped connection into a failed send (K-66). The status shown is the DB's.
      let outcome: PollOutcome;
      try {
        const r = await campaignProgressAction(runId);
        outcome = r.ok
          ? { ok: true, status: r.status ?? "sending", sent: r.sent ?? 0 }
          : { ok: false, error: r.error ?? "network" };
        if (r.ok && r.createdAt) startedAtRef.current = Date.parse(r.createdAt);
      } catch {
        outcome = { ok: false, error: "network" }; // a dropped connection is a blip, not a failure
      }
      if (!alive) return;
      setLoading(false);
      setState((prev) => reduceProgress(prev, outcome));
      setTick((n) => n + 1);
      // Stop polling only when the run itself is terminal, or it's gone — a network blip keeps polling.
      const stop = outcome.ok ? isRunTerminal(outcome.status) : outcome.error === "run_not_found";
      if (alive && !stop) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  const { status, sent, notFound } = state;
  const view = computeProgress({ sent, target, startedAtMs: startedAtRef.current, nowMs: Date.now() });
  const terminal = status ? isRunTerminal(status) : false;

  const statusText =
    status === "sending" ? p.statusSending
    : status === "sent" ? p.statusSent
    : status === "partial" ? p.statusPartial
    : status === "failed" ? p.statusFailed
    : status === "stopped" ? p.statusStopped
    : status === "draft" ? p.statusDraft
    : p.loading;
  const statusTone: "green" | "red" | "amber" | "blue" | "neutral" =
    status === "sent" ? "green"
    : status === "failed" ? "red"
    : status === "partial" || status === "stopped" ? "amber"
    : status === "sending" ? "blue"
    : "neutral";

  const rateText = view.ratePerSec != null ? `${view.ratePerSec.toFixed(1)} ${p.rateUnit}` : p.unknown;
  const etaText =
    view.etaSeconds == null ? p.etaCalculating
    : view.etaSeconds === 0 ? p.etaDone
    : formatDuration(view.etaSeconds);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link href={composeUrl()} className="inline-flex items-center gap-1.5 font-body text-[13px] text-red hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {p.back}
        </Link>
        <h1 className="mt-3 font-display text-[28px] font-black uppercase leading-none text-ink">{p.title}</h1>
        {label && <p className="mt-2 font-body text-[14px] text-ink-soft">{label}</p>}
      </div>

      {notFound ? (
        <div className="rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <p className="font-body text-[14px] text-ink-soft">{p.notFound}</p>
        </div>
      ) : (
        <>
          {/* The reassurance that fixes the incident: it is running on the server; closing is safe. */}
          {!terminal && (
            <div className="flex items-start gap-2.5 rounded-card tint-blue px-4 py-3">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue" aria-hidden />
              <p className="font-body text-[13px] leading-relaxed text-ink">{p.runningBanner}</p>
            </div>
          )}

          <div className="rounded-card border border-glass-border bg-glass p-5">
            <div className="flex items-center justify-between">
              <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">{p.statusHeading}</p>
              <Badge tone={statusTone}>{loading ? p.loading : statusText}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={p.targetLabel} value={view.target != null ? formatCount(view.target, lang) : p.unknown} />
              <Stat label={p.sentLabel} value={formatCount(view.sent, lang)} tone="green" />
              <Stat label={p.remainingLabel} value={view.remaining != null ? formatCount(view.remaining, lang) : p.unknown} />
              <Stat label={p.rateLabel} value={rateText} />
            </div>

            {!terminal && (
              <p className="mt-4 font-body text-[13px] text-ink-soft">
                {p.etaLabel}: <span className="font-semibold text-ink">{etaText}</span>
              </p>
            )}
            {terminal && <p className="mt-4 font-body text-[12px] leading-relaxed text-ink-faint">{p.doneNote}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div>
      <p className={`font-display text-[22px] font-semibold leading-none tabular-nums ${tone === "green" ? "text-green" : "text-ink"}`}>{value}</p>
      <p className="mt-1 font-body text-[11px] leading-snug text-ink-soft">{label}</p>
    </div>
  );
}

/** Seconds → a compact "Xm Ys" / "Ys" string (display only). */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}
