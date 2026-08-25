"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import {
  previewCampaignAction,
  listRunsAction,
  sendCampaignAction,
  type PreviewResult,
  type SendResult,
  type RunOption,
  type RunChoice,
} from "./actions";

export interface SegmentOption {
  id: string;
  name: string;
  requiresClinical: boolean;
}
export interface TemplateOption {
  key: string;
  name: string;
}

/** The instance the operator has picked to send as: continue a specific run, or open a new one.
 *  null until they choose — the send button stays disabled so the choice is never implied. */
type RunSelection = { kind: "resume"; runId: string } | { kind: "new" } | null;

const selectCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/**
 * Compose a send: pick a saved segment → pick a template → preview recipients (after suppression) →
 * choose the RUN (continue an existing instance or start a new one — a visually distinct choice, not
 * implied) → confirm → send. Every binding rule surfaces here: the skip count and the will-be-emailed
 * count show BEFORE send; a >500 send needs a second confirmation; the count is re-checked on send and
 * any drift is disclosed before it proceeds; the send button is disabled while pre-launch sending is
 * off OR no run is chosen. Clinical + unsubscribe gates are enforced server-side (this only relays
 * their messages). The run distinction is what crm_campaign_run buys: a new run re-sends to the same
 * people (next issue); resuming one run skips whoever it already reached (idempotency).
 */
export function CampaignComposer({
  segments,
  templates,
  realSend,
}: {
  segments: SegmentOption[];
  templates: TemplateOption[];
  realSend: boolean;
}) {
  const { lang, t } = useI18n();
  const cc = t.campaignsPage.composer;
  const fmt = (n: number) => formatCount(n, lang);
  const [segmentId, setSegmentId] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [shownSendable, setShownSendable] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runSel, setRunSel] = useState<RunSelection>(null);
  const [newLabel, setNewLabel] = useState("");
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const errText = (e: PreviewResult["error"] | SendResult["error"]): string => {
    switch (e) {
      case "clinical_gate": return cc.errClinical;
      case "no_unsubscribe": return cc.errNoUnsub;
      case "denied": return cc.errDenied;
      case "not_found": return cc.errNotFound;
      case "needs_confirm": return cc.errNeedConfirm;
      case "run_not_found": return cc.errRunNotFound;
      case "run_create_failed": return cc.errRunCreate;
      case "send_threw": return cc.errSendThrew;
      default: return cc.errNotFound;
    }
  };

  /** Reset the run choice whenever the segment/template pair changes — a run belongs to ONE pair. */
  function resetDownstream() {
    setPreview(null);
    setRuns([]);
    setRunSel(null);
    setNewLabel("");
    setConfirmLarge(false);
    setResult(null);
  }

  async function onPreview() {
    if (!segmentId || !templateKey) return;
    setPreviewing(true);
    setNotice(null);
    setResult(null);
    setConfirmLarge(false);
    setRunSel(null);
    try {
      const p = await previewCampaignAction(segmentId, templateKey);
      if (!p.ok) {
        setPreview(null);
        setRuns([]);
        setNotice(errText(p.error));
        return;
      }
      setPreview(p);
      setShownSendable(p.sendable ?? 0);
      // Load the runs the operator may continue for THIS pair, so resume-vs-new is an informed choice.
      setRunsLoading(true);
      const r = await listRunsAction(segmentId, templateKey);
      setRuns(r.ok ? r.runs ?? [] : []);
    } finally {
      setPreviewing(false);
      setRunsLoading(false);
    }
  }

  async function onSend() {
    if (!preview || !segmentId || !templateKey || !runSel) return;
    const run: RunChoice =
      runSel.kind === "resume"
        ? { kind: "resume", runId: runSel.runId }
        : { kind: "new", label: newLabel.trim() || null };
    setSending(true);
    setNotice(null);
    try {
      const r = await sendCampaignAction({ segmentId, templateKey, confirmedLargeSend: confirmLarge, shownSendable, run });
      if (!r.ok) {
        if (r.error === "count_changed" && typeof r.freshSendable === "number") {
          setShownSendable(r.freshSendable);
          setPreview({ ...preview, sendable: r.freshSendable });
          setNotice(`${cc.driftWarnA}${fmt(r.freshSendable)}${cc.driftWarnB}`);
        } else if (r.error === "send_threw") {
          // The run is marked stopped + last_error server-side; show the cause instead of silence.
          setNotice(`${cc.errSendThrew}${r.detail ? ` (${r.detail})` : ""}`);
        } else {
          setNotice(errText(r.error));
        }
        return;
      }
      setResult(r);
      // A completed send changes the run's progress — refresh the resumable list so a subsequent
      // send reflects the new already-sent counts (and drops a run that just finished).
      const refreshed = await listRunsAction(segmentId, templateKey);
      setRuns(refreshed.ok ? refreshed.runs ?? [] : []);
      setRunSel(null);
    } catch {
      setNotice(cc.errSendThrew);
    } finally {
      setSending(false);
    }
  }

  if (segments.length === 0) {
    return <p className="font-body text-[13px] leading-relaxed text-ink-soft">{cc.noSegments}</p>;
  }
  if (templates.length === 0) {
    return <p className="font-body text-[13px] leading-relaxed text-ink-soft">{cc.noTemplates}</p>;
  }

  const needsConfirm = preview?.needsLargeConfirm ?? false;
  const sendDisabled =
    !realSend || !preview || previewing || sending || !runSel || (needsConfirm && !confirmLarge);

  const statusBadge = (r: RunOption) =>
    r.status === "sending"
      ? <Badge tone="blue">{cc.runStatusSending}</Badge>
      : <Badge tone="neutral">{cc.runStatusDraft}</Badge>;

  return (
    <div className="glass-strong flex flex-col gap-4 rounded-card p-5">
      <h2 className="font-body text-[13px] font-semibold text-ink">{cc.title}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{cc.segmentLabel}</span>
          <select className={selectCls} value={segmentId} onChange={(e) => { setSegmentId(e.target.value); resetDownstream(); }}>
            <option value="">—</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.requiresClinical ? " ⚕" : ""}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{cc.templateLabel}</span>
          <select className={selectCls} value={templateKey} onChange={(e) => { setTemplateKey(e.target.value); resetDownstream(); }}>
            <option value="">—</option>
            {templates.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>{tpl.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <Button size="sm" onClick={onPreview} disabled={!segmentId || !templateKey || previewing}>
          {previewing ? cc.previewing : cc.previewBtn}
        </Button>
      </div>

      {preview && preview.ok && (
        <div className="flex flex-col gap-4 rounded-card border border-glass-border p-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{cc.matched}: {fmt(preview.matched ?? 0)}</Badge>
            <Badge tone="neutral">{cc.withEmail}: {fmt(preview.withEmail ?? 0)}</Badge>
            <Badge tone="neutral">{cc.noContact}: {fmt(preview.noContact ?? 0)}</Badge>
            <Badge tone="blue">{cc.suppressed}: {fmt(preview.suppressed ?? 0)}</Badge>
            <Badge tone="green">{cc.sendable}: {fmt(preview.sendable ?? 0)}</Badge>
          </div>

          {preview.spread?.exceedsToday && (
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              {cc.daysA}<strong>{fmt(preview.spread.daysNeeded)}</strong>{cc.daysB}
            </p>
          )}

          {/* RUN CHOICE — two visually distinct lanes. The operator MUST pick one (send stays
              disabled until then), so "resume an existing run" vs "start a new run" is an explicit,
              not-implied decision. Continuing a run skips whoever it already reached; a new run may
              reach them again. */}
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-body text-[13px] font-semibold text-ink">{cc.runTitle}</p>
              <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">{cc.runHint}</p>
            </div>

            {/* Lane A — continue an existing run (blue: work in flight). */}
            <div className="tint-blue flex flex-col gap-2 rounded-card p-3">
              <div className="flex items-center gap-2">
                <Badge tone="blue">{cc.runResumeBadge}</Badge>
                <span className="font-body text-[13px] font-semibold text-ink">{cc.runResumeHeading}</span>
              </div>
              {runsLoading ? (
                <p className="font-body text-[12px] text-ink-soft">{cc.runsLoading}</p>
              ) : runs.length === 0 ? (
                <p className="font-body text-[12px] text-ink-soft">{cc.runNoRuns}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {runs.map((r) => {
                    const selected = runSel?.kind === "resume" && runSel.runId === r.id;
                    return (
                      <label
                        key={r.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-sm border bg-glass px-3 py-2 ${
                          selected ? "border-red ring-1 ring-red" : "border-glass-border"
                        }`}
                      >
                        <input
                          type="radio"
                          name="run-choice"
                          checked={selected}
                          onChange={() => setRunSel({ kind: "resume", runId: r.id })}
                        />
                        <span className="flex flex-1 flex-wrap items-center gap-2">
                          <span className="font-body text-[13px] text-ink">{r.label ?? cc.runUntitled}</span>
                          {statusBadge(r)}
                          <span className="font-body text-[12px] text-ink-soft">
                            {fmt(r.sentCount)} {cc.runSentSuffix}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lane B — start a new run (neutral: nothing sent yet). Distinct block, distinct accent. */}
            <div className="tint-neutral flex flex-col gap-2 rounded-card p-3">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{cc.runNewBadge}</Badge>
                <span className="font-body text-[13px] font-semibold text-ink">{cc.runNewHeading}</span>
              </div>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-sm border bg-glass px-3 py-2 ${
                  runSel?.kind === "new" ? "border-red ring-1 ring-red" : "border-glass-border"
                }`}
              >
                <input
                  type="radio"
                  name="run-choice"
                  checked={runSel?.kind === "new"}
                  onChange={() => setRunSel({ kind: "new" })}
                />
                <span className="font-body text-[13px] text-ink">{cc.runNewHeading}</span>
              </label>
              {runSel?.kind === "new" && (
                <label className="flex flex-col gap-1.5">
                  <span className="font-body text-[12px] text-ink-soft">{cc.runLabelField}</span>
                  <input
                    type="text"
                    className={selectCls}
                    value={newLabel}
                    placeholder={cc.runLabelPlaceholder}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </label>
              )}
            </div>
          </div>

          {needsConfirm && (
            <label className="flex items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={confirmLarge} onChange={(e) => setConfirmLarge(e.target.checked)} />
              {cc.confirmLargeLabel}
            </label>
          )}

          <div className="flex items-center gap-3">
            <Button size="lg" onClick={onSend} disabled={sendDisabled}>
              {sending ? cc.sending : !realSend ? cc.blockedBtn : cc.sendBtn}
            </Button>
            {!runSel && realSend && (
              <span className="font-body text-[12px] text-ink-soft">{cc.runChooseFirst}</span>
            )}
          </div>
        </div>
      )}

      {notice && <p role="alert" className="font-body text-[13px] leading-relaxed text-red">{notice}</p>}

      {result?.ok && result.summary && (
        <div className="flex flex-col gap-2 rounded-card border border-glass-border p-4">
          <div className="flex items-center gap-2">
            <p className="font-body text-[13px] font-semibold text-ink">{cc.resultTitle}</p>
            <Badge tone={result.isNewRun ? "neutral" : "blue"}>
              {result.isNewRun ? cc.resRunLabelNew : cc.resRunLabelResume}
            </Badge>
            <span className="font-body text-[12px] text-ink-soft">{result.runLabel ?? cc.runUntitled}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{cc.resSent}: {fmt(result.summary.sent)}</Badge>
            <Badge tone="neutral">{cc.resAlreadySent}: {fmt(result.summary.skippedAlreadySent)}</Badge>
            <Badge tone="blue">{cc.resSkipped}: {fmt(result.summary.skippedSuppressed)}</Badge>
            <Badge tone="red">{cc.resFailed}: {fmt(
              result.summary.failed.invalid_address + result.summary.failed.hard_bounce +
              result.summary.failed.provider_rejected + result.summary.failed.unknown,
            )}</Badge>
            <Badge tone="neutral">{cc.resWithheld}: {fmt(result.withheldPrelaunch ?? 0)}</Badge>
          </div>
          {!result.realSend && (
            <p className="font-body text-[12px] leading-relaxed text-ink-faint">{cc.resInternalNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
