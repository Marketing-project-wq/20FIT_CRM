"use client";

import { useState } from "react";
import { Check, Lock, Users, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import { SegmentBuilder } from "@/components/segments/segment-builder";
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
  subject: string | null;
  body: string;
}

type RunSelection = { kind: "resume"; runId: string } | { kind: "new" } | null;

const selectCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/**
 * The campaign flow — ONE screen, ONE title, THREE ordered steps (nav rebuild): 1 Siapa (segment) →
 * 2 Pesan (template + preview) → 3 Kirim (run + confirm + send). A finished step collapses to a
 * one-line summary that reopens; the next step is LOCKED until the prior one has a result. Nothing
 * about the send logic, gates, or limits changes — this only reorders the existing pieces and reuses
 * the same server actions. The recipient count is re-checked on send (drift disclosed) exactly as
 * before. Max two levels of nesting (step → its own collapsibles).
 */
export function CampaignFlow({
  segments,
  templates,
  realSend,
  builder,
}: {
  segments: SegmentOption[];
  templates: TemplateOption[];
  realSend: boolean;
  /** Props for the embedded "build a new segment" SegmentBuilder inside step 1. */
  builder: { cityFillPct: number; cityFilled: number; total: number; canViewHealth: boolean; canBuild: boolean };
}) {
  const { lang, t } = useI18n();
  const c = t.campaignsPage.steps;
  const cc = t.campaignsPage.composer;
  const fmt = (n: number) => formatCount(n, lang);

  // Step 1
  const [segmentId, setSegmentId] = useState("");
  const [step1Counts, setStep1Counts] = useState<{ matched: number; contactableMarketing: number } | null>(null);
  // Step 2
  const [templateKey, setTemplateKey] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [shownSendable, setShownSendable] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  // Step 3
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runSel, setRunSel] = useState<RunSelection>(null);
  const [newLabel, setNewLabel] = useState("");
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Which step the operator is currently looking at (a done step can be reopened).
  const [open, setOpen] = useState<1 | 2 | 3>(1);

  const segment = segments.find((s) => s.id === segmentId) ?? null;
  const template = templates.find((tp) => tp.key === templateKey) ?? null;
  const step1Done = !!segment;
  const step2Done = !!(preview && preview.ok);

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
      case "unsubscribe_host_mismatch": return cc.errHostMismatch;
      default: return cc.errNotFound;
    }
  };

  function pickSegment(id: string) {
    setSegmentId(id);
    // choosing a new segment invalidates everything downstream
    setTemplateKey(""); setPreview(null); setRuns([]); setRunSel(null); setConfirmLarge(false); setResult(null); setNotice(null);
  }

  async function onPreview() {
    if (!segmentId || !templateKey) return;
    setPreviewing(true); setNotice(null); setResult(null); setConfirmLarge(false); setRunSel(null);
    try {
      const p = await previewCampaignAction(segmentId, templateKey);
      if (!p.ok) { setPreview(null); setRuns([]); setNotice(errText(p.error)); return; }
      setPreview(p); setShownSendable(p.sendable ?? 0);
      setRunsLoading(true);
      const r = await listRunsAction(segmentId, templateKey);
      setRuns(r.ok ? r.runs ?? [] : []);
      setOpen(3);
    } finally { setPreviewing(false); setRunsLoading(false); }
  }

  async function onSend() {
    if (!preview || !segmentId || !templateKey || !runSel) return;
    const run: RunChoice = runSel.kind === "resume" ? { kind: "resume", runId: runSel.runId } : { kind: "new", label: newLabel.trim() || null };
    setSending(true); setNotice(null);
    try {
      const r = await sendCampaignAction({ segmentId, templateKey, confirmedLargeSend: confirmLarge, shownSendable, run });
      if (!r.ok) {
        if (r.error === "count_changed" && typeof r.freshSendable === "number") {
          setShownSendable(r.freshSendable);
          setPreview({ ...preview, sendable: r.freshSendable });
          setNotice(`${cc.driftWarnA}${fmt(r.freshSendable)}${cc.driftWarnB}`);
        } else if (r.error === "send_threw") {
          setNotice(`${cc.errSendThrew}${r.detail ? ` (${r.detail})` : ""}`);
        } else { setNotice(errText(r.error)); }
        return;
      }
      setResult(r);
      const refreshed = await listRunsAction(segmentId, templateKey);
      setRuns(refreshed.ok ? refreshed.runs ?? [] : []);
      setRunSel(null);
    } catch { setNotice(cc.errSendThrew); }
    finally { setSending(false); }
  }

  const needsConfirm = preview?.needsLargeConfirm ?? false;
  const sendDisabled = !realSend || !preview || previewing || sending || !runSel || (needsConfirm && !confirmLarge);
  const statusBadge = (r: RunOption) =>
    r.status === "sending" ? <Badge tone="blue">{cc.runStatusSending}</Badge> : <Badge tone="neutral">{cc.runStatusDraft}</Badge>;

  // A step shell: numbered header (done ✓ / locked 🔒), collapsible body, one-line summary when collapsed.
  function Step({ n, title, done, locked, summary, children }: { n: 1 | 2 | 3; title: string; done: boolean; locked: boolean; summary?: string; children: React.ReactNode }) {
    const isOpen = open === n && !locked;
    return (
      <section className={`rounded-card border ${locked ? "border-glass-border/50 opacity-60" : "border-glass-border"} bg-glass`}>
        <button
          type="button"
          disabled={locked}
          onClick={() => !locked && setOpen(n)}
          className="flex w-full items-center gap-3 px-5 py-4 text-left disabled:cursor-not-allowed"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-bold ${done ? "bg-red text-white" : locked ? "bg-glass text-ink-faint" : "border border-red text-red"}`}>
            {done ? <Check className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{title}</span>
            {!isOpen && summary && <span className="mt-0.5 block truncate font-body text-[12px] text-ink-soft">{summary}</span>}
          </span>
        </button>
        {isOpen && <div className="border-t border-glass-border px-5 py-5">{children}</div>}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* STEP 1 · SIAPA */}
      <Step
        n={1}
        title={c.step1Title}
        done={step1Done}
        locked={false}
        summary={segment ? `${segment.name}${step1Counts ? ` · ${fmt(step1Counts.contactableMarketing)} ${c.step1SummarySuffix}` : ""}` : undefined}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-ink-soft">
            <Users className="h-4 w-4" aria-hidden />
            <p className="font-body text-[13px]">{c.step1Hint}</p>
          </div>
          {segments.length === 0 ? (
            <p className="font-body text-[13px] text-ink-soft">{cc.noSegments}</p>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{c.step1SegmentLabel}</span>
              <select className={selectCls} value={segmentId} onChange={(e) => pickSegment(e.target.value)}>
                <option value="">—</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}{s.requiresClinical ? " ⚕" : ""}</option>)}
              </select>
            </label>
          )}

          {builder.canBuild && (
            <details className="rounded-card border border-glass-border/70 p-4">
              <summary className="cursor-pointer select-none font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft">{c.step1BuildNew}</summary>
              <p className="mt-2 font-body text-[12px] text-ink-faint">{c.step1BuildNewHint}</p>
              <div className="mt-3">
                <SegmentBuilder
                  embedded
                  cityFillPct={builder.cityFillPct}
                  cityFilled={builder.cityFilled}
                  total={builder.total}
                  canViewHealth={builder.canViewHealth}
                  onComputed={(cnt) => setStep1Counts(cnt ? { matched: cnt.matched, contactableMarketing: cnt.contactableMarketing } : null)}
                />
              </div>
            </details>
          )}

          {segment && (
            <div>
              <Button size="sm" onClick={() => setOpen(2)}>{c.toStep2}</Button>
            </div>
          )}
        </div>
      </Step>

      {/* STEP 2 · PESAN */}
      <Step
        n={2}
        title={c.step2Title}
        done={step2Done}
        locked={!step1Done}
        summary={template ? `${template.name}${preview?.ok ? ` · ${fmt(preview.sendable ?? 0)} ${c.step2SummarySuffix}` : ""}` : undefined}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-ink-soft">
            <Mail className="h-4 w-4" aria-hidden />
            <p className="font-body text-[13px]">{c.step2Hint}</p>
          </div>
          {templates.length === 0 ? (
            <p className="font-body text-[13px] text-ink-soft">{cc.noTemplates}</p>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{cc.templateLabel}</span>
              <select className={selectCls} value={templateKey} onChange={(e) => { setTemplateKey(e.target.value); setPreview(null); setRunSel(null); setResult(null); }}>
                <option value="">—</option>
                {templates.map((tp) => <option key={tp.key} value={tp.key}>{tp.name}</option>)}
              </select>
            </label>
          )}

          {/* Content preview — what will be sent (variables shown as placeholders). */}
          {template && (
            <div className="rounded-card border border-glass-border p-4">
              <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{c.step2PreviewLabel}</p>
              {template.subject && <p className="mt-2 font-body text-[14px] font-semibold text-ink">{template.subject}</p>}
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-body text-[13px] leading-relaxed text-ink-soft">{template.body}</pre>
            </div>
          )}

          <div>
            <Button size="sm" onClick={onPreview} disabled={!segmentId || !templateKey || previewing}>
              {previewing ? cc.previewing : c.step2CountBtn}
            </Button>
          </div>

          {preview && preview.ok && (
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{cc.matched}: {fmt(preview.matched ?? 0)}</Badge>
              <Badge tone="neutral">{cc.withEmail}: {fmt(preview.withEmail ?? 0)}</Badge>
              <Badge tone="blue">{cc.suppressed}: {fmt(preview.suppressed ?? 0)}</Badge>
              <Badge tone="green">{cc.sendable}: {fmt(preview.sendable ?? 0)}</Badge>
            </div>
          )}
          {preview?.ok && (
            <div><Button size="sm" onClick={() => setOpen(3)}>{c.toStep3}</Button></div>
          )}
          {notice && !preview?.ok && <p role="alert" className="font-body text-[13px] text-red">{notice}</p>}
        </div>
      </Step>

      {/* STEP 3 · KIRIM */}
      <Step
        n={3}
        title={c.step3Title}
        done={!!result?.ok}
        locked={!step2Done}
        summary={result?.ok && result.summary ? `${fmt(result.summary.sent)} ${c.step3SummarySuffix}` : undefined}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-ink-soft">
            <Send className="h-4 w-4" aria-hidden />
            <p className="font-body text-[13px]">{c.step3Hint}</p>
          </div>

          {preview?.spread?.exceedsToday && (
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              {cc.daysA}<strong>{fmt(preview.spread.daysNeeded)}</strong>{cc.daysB}
            </p>
          )}

          {/* RUN CHOICE — two distinct lanes; the operator MUST pick one. */}
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-body text-[13px] font-semibold text-ink">{cc.runTitle}</p>
              <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">{cc.runHint}</p>
            </div>
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
                      <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-sm border bg-glass px-3 py-2 ${selected ? "border-red ring-1 ring-red" : "border-glass-border"}`}>
                        <input type="radio" name="run-choice" checked={selected} onChange={() => setRunSel({ kind: "resume", runId: r.id })} />
                        <span className="flex flex-1 flex-wrap items-center gap-2">
                          <span className="font-body text-[13px] text-ink">{r.label ?? cc.runUntitled}</span>
                          {statusBadge(r)}
                          <span className="font-body text-[12px] text-ink-soft">{fmt(r.sentCount)} {cc.runSentSuffix}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="tint-neutral flex flex-col gap-2 rounded-card p-3">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{cc.runNewBadge}</Badge>
                <span className="font-body text-[13px] font-semibold text-ink">{cc.runNewHeading}</span>
              </div>
              <label className={`flex cursor-pointer items-center gap-3 rounded-sm border bg-glass px-3 py-2 ${runSel?.kind === "new" ? "border-red ring-1 ring-red" : "border-glass-border"}`}>
                <input type="radio" name="run-choice" checked={runSel?.kind === "new"} onChange={() => setRunSel({ kind: "new" })} />
                <span className="font-body text-[13px] text-ink">{cc.runNewHeading}</span>
              </label>
              {runSel?.kind === "new" && (
                <label className="flex flex-col gap-1.5">
                  <span className="font-body text-[12px] text-ink-soft">{cc.runLabelField}</span>
                  <input type="text" className={selectCls} value={newLabel} placeholder={cc.runLabelPlaceholder} onChange={(e) => setNewLabel(e.target.value)} />
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
            {!runSel && realSend && <span className="font-body text-[12px] text-ink-soft">{cc.runChooseFirst}</span>}
          </div>

          {notice && <p role="alert" className="font-body text-[13px] leading-relaxed text-red">{notice}</p>}

          {result?.ok && result.summary && (
            <div className="flex flex-col gap-2 rounded-card border border-glass-border p-4">
              <div className="flex items-center gap-2">
                <p className="font-body text-[13px] font-semibold text-ink">{cc.resultTitle}</p>
                <Badge tone={result.isNewRun ? "neutral" : "blue"}>{result.isNewRun ? cc.resRunLabelNew : cc.resRunLabelResume}</Badge>
                <span className="font-body text-[12px] text-ink-soft">{result.runLabel ?? cc.runUntitled}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="green">{cc.resSent}: {fmt(result.summary.sent)}</Badge>
                <Badge tone="neutral">{cc.resAlreadySent}: {fmt(result.summary.skippedAlreadySent)}</Badge>
                <Badge tone="blue">{cc.resSkipped}: {fmt(result.summary.skippedSuppressed)}</Badge>
                <Badge tone="red">{cc.resFailed}: {fmt(result.summary.failed.invalid_address + result.summary.failed.hard_bounce + result.summary.failed.provider_rejected + result.summary.failed.unknown)}</Badge>
                <Badge tone="neutral">{cc.resWithheld}: {fmt(result.withheldPrelaunch ?? 0)}</Badge>
              </div>
              {!result.realSend && <p className="font-body text-[12px] leading-relaxed text-ink-faint">{cc.resInternalNote}</p>}
            </div>
          )}
        </div>
      </Step>
    </div>
  );
}
