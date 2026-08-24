"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import { previewCampaignAction, sendCampaignAction, type PreviewResult, type SendResult } from "./actions";

export interface SegmentOption {
  id: string;
  name: string;
  requiresClinical: boolean;
}
export interface TemplateOption {
  key: string;
  name: string;
}

const selectCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/**
 * Compose a send: pick a saved segment → pick a template → preview recipients (after suppression) →
 * confirm → send. Every binding rule surfaces here: the skip count and the will-be-emailed count
 * show BEFORE send; a >500 send needs a second confirmation; the count is re-checked on send and any
 * drift is disclosed before it proceeds; the send button is disabled while pre-launch sending is off.
 * Clinical + unsubscribe gates are enforced server-side (this only relays their messages).
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
      default: return cc.errNotFound;
    }
  };

  async function onPreview() {
    if (!segmentId || !templateKey) return;
    setPreviewing(true);
    setNotice(null);
    setResult(null);
    setConfirmLarge(false);
    try {
      const p = await previewCampaignAction(segmentId, templateKey);
      if (!p.ok) {
        setPreview(null);
        setNotice(errText(p.error));
        return;
      }
      setPreview(p);
      setShownSendable(p.sendable ?? 0);
    } finally {
      setPreviewing(false);
    }
  }

  async function onSend() {
    if (!preview || !segmentId || !templateKey) return;
    setSending(true);
    setNotice(null);
    try {
      const r = await sendCampaignAction({ segmentId, templateKey, confirmedLargeSend: confirmLarge, shownSendable });
      if (!r.ok) {
        if (r.error === "count_changed" && typeof r.freshSendable === "number") {
          setShownSendable(r.freshSendable);
          setPreview({ ...preview, sendable: r.freshSendable });
          setNotice(`${cc.driftWarnA}${fmt(r.freshSendable)}${cc.driftWarnB}`);
        } else {
          setNotice(errText(r.error));
        }
        return;
      }
      setResult(r);
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
  const sendDisabled = !realSend || !preview || previewing || sending || (needsConfirm && !confirmLarge);

  return (
    <div className="glass-strong flex flex-col gap-4 rounded-card p-5">
      <h2 className="font-body text-[13px] font-semibold text-ink">{cc.title}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{cc.segmentLabel}</span>
          <select className={selectCls} value={segmentId} onChange={(e) => { setSegmentId(e.target.value); setPreview(null); }}>
            <option value="">—</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.requiresClinical ? " ⚕" : ""}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{cc.templateLabel}</span>
          <select className={selectCls} value={templateKey} onChange={(e) => { setTemplateKey(e.target.value); setPreview(null); }}>
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
        <div className="flex flex-col gap-3 rounded-card border border-glass-border p-4">
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

          {needsConfirm && (
            <label className="flex items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={confirmLarge} onChange={(e) => setConfirmLarge(e.target.checked)} />
              {cc.confirmLargeLabel}
            </label>
          )}

          <div>
            <Button size="lg" onClick={onSend} disabled={sendDisabled}>
              {sending ? cc.sending : !realSend ? cc.blockedBtn : cc.sendBtn}
            </Button>
          </div>
        </div>
      )}

      {notice && <p role="alert" className="font-body text-[13px] leading-relaxed text-red">{notice}</p>}

      {result?.ok && result.summary && (
        <div className="flex flex-col gap-2 rounded-card border border-glass-border p-4">
          <p className="font-body text-[13px] font-semibold text-ink">{cc.resultTitle}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{cc.resSent}: {fmt(result.summary.sent)}</Badge>
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
