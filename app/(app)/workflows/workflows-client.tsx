"use client";

import { useState } from "react";
import { Plus, Play, Zap, Clock, Check, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import {
  createWorkflowAction,
  setWorkflowActiveAction,
  runWorkflowAction,
  type WorkflowRunResult,
} from "./actions";
import type { WorkflowWithCounts, WorkflowType, WorkflowTriggerSource } from "@/lib/crm/workflow-store";
import { workflowStatusBadge } from "@/lib/crm/workflow-badge";

export interface TemplateOpt {
  key: string;
  name: string;
}

const inputCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

export function WorkflowsClient({
  initial,
  templates,
  realSend,
}: {
  initial: WorkflowWithCounts[];
  templates: TemplateOpt[];
  realSend: boolean;
}) {
  const { lang, t } = useI18n();
  const w = t.workflowsPage;
  const fmt = (n: number) => formatCount(n, lang);

  const [workflows, setWorkflows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<WorkflowType>("welcome");
  const [days, setDays] = useState("7");
  const [triggerSource, setTriggerSource] = useState<WorkflowTriggerSource>("pool");
  const [templateKey, setTemplateKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ id: string; r: WorkflowRunResult } | null>(null);

  // One run-failure code → one message. The engine returns a NAMED reason for each distinct state
  // (T-38 pattern: "one message hides many states"). Never collapse them back to one line.
  function runErrText(error: string | undefined): string {
    switch (error) {
      case "workflow_inactive": return w.errInactive;
      case "not_found": return w.errNotFound;
      case "resolve_failed": return w.errResolve;
      case "run_create_failed": return w.errRunCreate;
      case "send_threw": return w.errSendThrew;
      case "denied": return w.errDenied;
      default: return w.runFailed;
    }
  }

  async function reload() {
    // Server action list is cheap; re-fetch via a full action call.
    const { listWorkflowsAction } = await import("./actions");
    const res = await listWorkflowsAction();
    if (res.ok) setWorkflows(res.workflows);
  }

  async function onCreate() {
    const d = Number(days);
    if (!name.trim() || !templateKey || !Number.isFinite(d) || d < 1) return;
    setBusy(true); setNotice(null);
    try {
      // Reengagement has no "new profile" pool concept — it keys on last-active recency, so it is
      // always the activity layer. Only welcome offers the source choice.
      const source: WorkflowTriggerSource = type === "welcome" ? triggerSource : "activity";
      const res = await createWorkflowAction({ name: name.trim(), type, triggerDays: Math.floor(d), triggerSource: source, templateKey });
      if (!res.ok) { setNotice(res.error === "empty_name" ? w.errName : w.errCreate); return; }
      setName(""); setTemplateKey(""); setDays("7"); setShowForm(false);
      await reload();
    } finally { setBusy(false); }
  }

  async function onToggle(id: string, active: boolean) {
    await setWorkflowActiveAction(id, active);
    await reload();
  }

  async function onRun(id: string) {
    setBusy(true); setNotice(null); setRunResult(null);
    try {
      const r = await runWorkflowAction(id);
      setRunResult({ id, r });
      await reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.workflows}</h1>
          <p className="mt-2 max-w-2xl font-body text-[14px] leading-relaxed text-ink-soft">{w.subtitle}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />{w.newBtn}
        </Button>
      </div>

      {!realSend && (
        <div className="tint-amber rounded-card p-4">
          <p className="font-body text-[13px] leading-relaxed text-ink">{w.prelaunchNote}</p>
        </div>
      )}

      {showForm && (
        <div className="glass-strong flex flex-col gap-4 rounded-card p-5">
          <p className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{w.newTitle}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{w.fieldName}</span>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={w.namePlaceholder} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{w.fieldTemplate}</span>
              <select className={inputCls} value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                <option value="">—</option>
                {templates.map((tp) => <option key={tp.key} value={tp.key}>{tp.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{w.fieldType}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setType("welcome")}
                  className={`flex flex-1 items-center gap-2 rounded-sm border p-3 text-left ${type === "welcome" ? "tint-red border-red" : "border-glass-border"}`}>
                  <Zap className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="font-body text-[13px]">{w.typeWelcome}</span>
                </button>
                <button type="button" onClick={() => setType("reengagement")}
                  className={`flex flex-1 items-center gap-2 rounded-sm border p-3 text-left ${type === "reengagement" ? "tint-red border-red" : "border-glass-border"}`}>
                  <Clock className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="font-body text-[13px]">{w.typeReeng}</span>
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">
                {type === "welcome" ? w.daysWelcome : w.daysReeng}
              </span>
              <input type="number" min={1} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
          </div>
          {type === "welcome" && (
            <div className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{w.fieldSource}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTriggerSource("pool")}
                  className={`flex flex-1 items-center gap-2 rounded-sm border p-3 text-left ${triggerSource === "pool" ? "tint-red border-red" : "border-glass-border"}`}>
                  <span className="font-body text-[13px]">{w.sourcePool}</span>
                </button>
                <button type="button" onClick={() => setTriggerSource("activity")}
                  className={`flex flex-1 items-center gap-2 rounded-sm border p-3 text-left ${triggerSource === "activity" ? "tint-red border-red" : "border-glass-border"}`}>
                  <span className="font-body text-[13px]">{w.sourceActivity}</span>
                </button>
              </div>
              <p className="font-body text-[12px] leading-relaxed text-ink-faint">{w.sourceNote}</p>
            </div>
          )}
          <p className="font-body text-[12px] leading-relaxed text-ink-faint">{w.coverageNote}</p>
          {notice && <p role="alert" className="font-body text-[13px] text-red">{notice}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={onCreate} disabled={busy || !name.trim() || !templateKey}>{w.createBtn}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>{w.cancelBtn}</Button>
          </div>
        </div>
      )}

      {workflows.length === 0 ? (
        <p className="font-body text-[13px] text-ink-soft">{w.empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="glass flex flex-col gap-3 rounded-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                {wf.type === "welcome" ? <Zap className="h-4 w-4 text-ink-soft" aria-hidden /> : <Clock className="h-4 w-4 text-ink-soft" aria-hidden />}
                <span className="font-body text-[15px] font-semibold text-ink">{wf.name}</span>
                {(() => { const b = workflowStatusBadge(wf.isActive); return <Badge tone={b.tone}>{w[b.key]}</Badge>; })()}
                <span className="font-body text-[12px] text-ink-soft">
                  {wf.type === "welcome" ? w.summaryWelcome.replace("{n}", String(wf.triggerDays)) : w.summaryReeng.replace("{n}", String(wf.triggerDays))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{w.enrolled}: {fmt(wf.enrolledCount)}</Badge>
                <Badge tone="green">{w.sent}: {fmt(wf.sentCount)}</Badge>
              </div>
              {runResult?.id === wf.id && runResult.r.ok && (
                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">{w.newlyEnrolled}: {fmt(runResult.r.newlyEnrolled ?? 0)}</Badge>
                  <Badge tone="green">{w.justSent}: {fmt(runResult.r.sent ?? 0)}</Badge>
                  {(runResult.r.withheld ?? 0) > 0 && <Badge tone="amber">{w.withheld}: {fmt(runResult.r.withheld ?? 0)}</Badge>}
                </div>
              )}
              {runResult?.id === wf.id && !runResult.r.ok && (
                <p role="alert" className="font-body text-[12px] text-red">{runErrText(runResult.r.error)}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onRun(wf.id)} disabled={busy || !wf.isActive} title={!wf.isActive ? w.errInactive : undefined}>
                  <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />{w.runNow}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onToggle(wf.id, !wf.isActive)} disabled={busy}>
                  {wf.isActive ? <><Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden />{w.pause}</> : <><Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />{w.activate}</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
