"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Zap, Clock, MoreVertical, Pencil, Eye, Trash2, History, Play, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";
import {
  createWorkflowAction,
  setWorkflowActiveAction,
  runWorkflowAction,
  updateWorkflowAction,
  deleteWorkflowAction,
  listEnrollmentsAction,
  getTemplatePreviewAction,
  type WorkflowRunResult,
} from "./actions";
import type {
  WorkflowWithCounts,
  WorkflowType,
  WorkflowTriggerSource,
  EnrollmentRow,
} from "@/lib/crm/workflow-store";
import { workflowStatusBadge } from "@/lib/crm/workflow-badge";

export interface TemplateOpt {
  key: string;
  name: string;
}

const inputCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

const statusTone: Record<string, "neutral" | "green" | "red" | "amber"> = {
  queued: "neutral",
  sent: "green",
  failed: "red",
  skipped: "amber",
};

function KebabMenu({ items }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-sm p-1.5 text-ink-soft transition-colors hover:bg-glass hover:text-ink"
        aria-label="Menu"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-sm border border-glass-border py-1 shadow-glass-lg">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left font-body text-[13px] transition-colors hover:bg-glass ${item.danger ? "text-red" : "text-ink"}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-green" : "bg-glass-border"}`}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function fmtDate(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtDateTime(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang === "id" ? "id-ID" : "en-US", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

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

  // Dialog state
  const [editWf, setEditWf] = useState<WorkflowWithCounts | null>(null);
  const [editName, setEditName] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [editDays, setEditDays] = useState("");
  const [editSource, setEditSource] = useState<WorkflowTriggerSource>("pool");

  const [deleteWf, setDeleteWf] = useState<WorkflowWithCounts | null>(null);
  const [previewWf, setPreviewWf] = useState<WorkflowWithCounts | null>(null);
  const [previewData, setPreviewData] = useState<{ subject?: string; body?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [historyWf, setHistoryWf] = useState<WorkflowWithCounts | null>(null);
  const [historyRows, setHistoryRows] = useState<EnrollmentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [runWf, setRunWf] = useState<WorkflowWithCounts | null>(null);
  const [toggleWf, setToggleWf] = useState<{ wf: WorkflowWithCounts; next: boolean } | null>(null);

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

  const reload = useCallback(async () => {
    const { listWorkflowsAction } = await import("./actions");
    const res = await listWorkflowsAction();
    if (res.ok) setWorkflows(res.workflows);
  }, []);

  async function onCreate() {
    const d = Number(days);
    if (!name.trim() || !templateKey || !Number.isFinite(d) || d < 1) return;
    setBusy(true); setNotice(null);
    try {
      const source: WorkflowTriggerSource = type === "welcome" ? triggerSource : "activity";
      const res = await createWorkflowAction({ name: name.trim(), type, triggerDays: Math.floor(d), triggerSource: source, templateKey });
      if (!res.ok) { setNotice(res.error === "empty_name" ? w.errName : w.errCreate); return; }
      setName(""); setTemplateKey(""); setDays("7"); setShowForm(false);
      await reload();
    } finally { setBusy(false); }
  }

  async function onToggleConfirm() {
    if (!toggleWf) return;
    setBusy(true);
    try {
      await setWorkflowActiveAction(toggleWf.wf.id, toggleWf.next);
      await reload();
    } finally {
      setBusy(false);
      setToggleWf(null);
    }
  }

  async function onRun() {
    if (!runWf) return;
    const id = runWf.id;
    setBusy(true); setNotice(null); setRunResult(null); setRunWf(null);
    try {
      const r = await runWorkflowAction(id);
      setRunResult({ id, r });
      await reload();
    } finally { setBusy(false); }
  }

  async function onEditSave() {
    if (!editWf) return;
    setBusy(true); setNotice(null);
    try {
      const d = Number(editDays);
      const res = await updateWorkflowAction(editWf.id, {
        name: editName.trim() || undefined,
        templateKey: editTemplate || undefined,
        triggerDays: Number.isFinite(d) && d >= 1 ? Math.floor(d) : undefined,
        triggerSource: editWf.type === "welcome" ? editSource : undefined,
      });
      if (!res.ok) { setNotice(w.errUpdate); return; }
      setEditWf(null);
      await reload();
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!deleteWf) return;
    setBusy(true); setNotice(null);
    try {
      const res = await deleteWorkflowAction(deleteWf.id);
      if (!res.ok) {
        setNotice(res.error === "has_runs" ? w.errHasRuns : w.errDelete);
        return;
      }
      setDeleteWf(null);
      await reload();
    } finally { setBusy(false); }
  }

  async function openPreview(wf: WorkflowWithCounts) {
    setPreviewWf(wf);
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const res = await getTemplatePreviewAction(wf.templateKey);
      if (res.ok) setPreviewData({ subject: res.subject, body: res.body });
      else setPreviewData(null);
    } finally { setPreviewLoading(false); }
  }

  async function openHistory(wf: WorkflowWithCounts) {
    setHistoryWf(wf);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await listEnrollmentsAction(wf.id);
      if (res.ok) setHistoryRows(res.enrollments);
    } finally { setHistoryLoading(false); }
  }

  function openEdit(wf: WorkflowWithCounts) {
    setEditWf(wf);
    setEditName(wf.name);
    setEditTemplate(wf.templateKey);
    setEditDays(String(wf.triggerDays));
    setEditSource(wf.triggerSource);
    setNotice(null);
  }

  const templateName = (key: string) => templates.find((tp) => tp.key === key)?.name ?? key;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
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

      {/* Create form */}
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

      {/* Workflow cards or empty state */}
      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-glass">
            <Mail className="h-7 w-7 text-ink-soft" aria-hidden />
          </div>
          <p className="font-display text-[16px] font-bold uppercase text-ink">{w.emptyIcon}</p>
          <p className="max-w-md font-body text-[13px] leading-relaxed text-ink-soft">{w.emptyDesc}</p>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />{w.emptyCta}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {workflows.map((wf) => {
            const badge = workflowStatusBadge(wf.isActive);
            const sc = wf.statusCounts;
            return (
              <div key={wf.id} className="glass flex flex-col gap-3 rounded-card p-5">
                {/* Row 1: title + toggle + kebab */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {wf.type === "welcome" ? <Zap className="h-4 w-4 text-ink-soft" aria-hidden /> : <Clock className="h-4 w-4 text-ink-soft" aria-hidden />}
                    <span className="font-body text-[15px] font-semibold text-ink">{wf.name}</span>
                    <Badge tone={badge.tone}>{w[badge.key]}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={wf.isActive}
                      disabled={busy}
                      onChange={(next) => setToggleWf({ wf, next })}
                    />
                    <KebabMenu items={[
                      { label: w.menuEdit, icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(wf) },
                      { label: w.menuPreview, icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openPreview(wf) },
                      { label: w.menuHistory, icon: <History className="h-3.5 w-3.5" />, onClick: () => openHistory(wf) },
                      { label: w.menuRun, icon: <Play className="h-3.5 w-3.5" />, onClick: () => setRunWf(wf) },
                      { label: w.menuDelete, icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteWf(wf), danger: true },
                    ]} />
                  </div>
                </div>

                {/* Row 2: metadata */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 font-body text-[12px] text-ink-soft">
                  <span>
                    {wf.type === "welcome" ? w.summaryWelcome.replace("{n}", String(wf.triggerDays)) : w.summaryReeng.replace("{n}", String(wf.triggerDays))}
                  </span>
                  <span>{w.cardTemplate}: {templateName(wf.templateKey)}</span>
                  {wf.createdBy && <span>{w.cardCreatedBy}: {wf.createdBy}</span>}
                  <span>{w.cardCreatedAt}: {fmtDate(wf.createdAt, lang)}</span>
                  <span>{w.cardLastEnrolled}: {wf.lastEnrolledAt ? fmtDate(wf.lastEnrolledAt, lang) : w.cardNever}</span>
                </div>

                {/* Row 3: status breakdown badges */}
                <div className="flex flex-wrap gap-1.5">
                  {sc.queued > 0 && <Badge tone="neutral">{w.statusQueued}: {fmt(sc.queued)}</Badge>}
                  {sc.sent > 0 && <Badge tone="green">{w.statusSent}: {fmt(sc.sent)}</Badge>}
                  {sc.failed > 0 && <Badge tone="red">{w.statusFailed}: {fmt(sc.failed)}</Badge>}
                  {sc.skipped > 0 && <Badge tone="amber">{w.statusSkipped}: {fmt(sc.skipped)}</Badge>}
                  {sc.queued === 0 && sc.sent === 0 && sc.failed === 0 && sc.skipped === 0 && (
                    <Badge tone="neutral">{w.enrolled}: 0</Badge>
                  )}
                </div>

                {/* Run result inline */}
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
              </div>
            );
          })}
        </div>
      )}

      {/* ── DIALOG: Toggle confirm ── */}
      <Dialog open={!!toggleWf} onOpenChange={(o) => { if (!o) setToggleWf(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{toggleWf?.next ? w.toggleActivateTitle : w.togglePauseTitle}</DialogTitle>
            <DialogDescription>{toggleWf?.next ? w.toggleActivateDesc : w.togglePauseDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setToggleWf(null)}>{w.cancelBtn}</Button>
            <Button size="sm" onClick={onToggleConfirm} disabled={busy}>{w.toggleConfirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Run confirm ── */}
      <Dialog open={!!runWf} onOpenChange={(o) => { if (!o) setRunWf(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{w.runTitle}</DialogTitle>
            <DialogDescription>{w.runDesc.replace("{name}", runWf?.name ?? "")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRunWf(null)}>{w.cancelBtn}</Button>
            <Button size="sm" onClick={onRun} disabled={busy}>
              <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />{w.runConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Edit ── */}
      <Dialog open={!!editWf} onOpenChange={(o) => { if (!o) { setEditWf(null); setNotice(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{w.editTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{w.fieldName}</span>
              <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">{w.fieldTemplate}</span>
              <select className={inputCls} value={editTemplate} onChange={(e) => setEditTemplate(e.target.value)}>
                <option value="">—</option>
                {templates.map((tp) => <option key={tp.key} value={tp.key}>{tp.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-[12px] text-ink-soft">
                {editWf?.type === "welcome" ? w.daysWelcome : w.daysReeng}
              </span>
              <input type="number" min={1} className={inputCls} value={editDays} onChange={(e) => setEditDays(e.target.value)} />
            </label>
            {editWf?.type === "welcome" && (
              <div className="flex flex-col gap-1.5">
                <span className="font-body text-[12px] text-ink-soft">{w.fieldSource}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditSource("pool")}
                    className={`flex flex-1 items-center gap-2 rounded-sm border p-3 text-left ${editSource === "pool" ? "tint-red border-red" : "border-glass-border"}`}>
                    <span className="font-body text-[13px]">{w.sourcePool}</span>
                  </button>
                  <button type="button" onClick={() => setEditSource("activity")}
                    className={`flex flex-1 items-center gap-2 rounded-sm border p-3 text-left ${editSource === "activity" ? "tint-red border-red" : "border-glass-border"}`}>
                    <span className="font-body text-[13px]">{w.sourceActivity}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          {notice && <p role="alert" className="font-body text-[13px] text-red">{notice}</p>}
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => { setEditWf(null); setNotice(null); }}>{w.cancelBtn}</Button>
            <Button size="sm" onClick={onEditSave} disabled={busy || !editName.trim()}>{w.editSave}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Delete confirm ── */}
      <Dialog open={!!deleteWf} onOpenChange={(o) => { if (!o) { setDeleteWf(null); setNotice(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{w.deleteTitle}</DialogTitle>
            <DialogDescription>{w.deleteDesc.replace("{name}", deleteWf?.name ?? "")}</DialogDescription>
          </DialogHeader>
          {notice && <p role="alert" className="font-body text-[13px] text-red">{notice}</p>}
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => { setDeleteWf(null); setNotice(null); }}>{w.cancelBtn}</Button>
            <Button size="sm" className="bg-red text-white" onClick={onDelete} disabled={busy}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />{w.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Preview ── */}
      <Dialog open={!!previewWf} onOpenChange={(o) => { if (!o) setPreviewWf(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{w.previewTitle}</DialogTitle>
            <DialogDescription>{templateName(previewWf?.templateKey ?? "")}</DialogDescription>
          </DialogHeader>
          {previewLoading && <p className="font-body text-[13px] text-ink-soft">{w.previewLoading}</p>}
          {!previewLoading && !previewData && <p className="font-body text-[13px] text-red">{w.previewFailed}</p>}
          {!previewLoading && previewData && (
            <div className="flex flex-col gap-3">
              {previewData.subject && (
                <div>
                  <span className="font-body text-[12px] font-semibold text-ink-soft">{w.previewSubject}:</span>
                  <p className="font-body text-[14px] text-ink">{previewData.subject}</p>
                </div>
              )}
              <div className="max-h-[400px] overflow-auto rounded-sm border border-glass-border bg-white p-4">
                <div dangerouslySetInnerHTML={{ __html: previewData.body ?? "" }} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: Enrollment history ── */}
      <Dialog open={!!historyWf} onOpenChange={(o) => { if (!o) setHistoryWf(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{w.historyTitle}</DialogTitle>
            <DialogDescription>{historyWf?.name}</DialogDescription>
          </DialogHeader>
          {historyLoading && <p className="font-body text-[13px] text-ink-soft">{w.historyLoading}</p>}
          {!historyLoading && historyRows.length === 0 && (
            <p className="font-body text-[13px] text-ink-soft">{w.historyEmpty}</p>
          )}
          {!historyLoading && historyRows.length > 0 && (
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full font-body text-[13px]">
                <thead>
                  <tr className="border-b border-glass-border text-left text-[12px] text-ink-soft">
                    <th className="pb-2 pr-3">{w.historyEmail}</th>
                    <th className="pb-2 pr-3">{w.historyStatus}</th>
                    <th className="pb-2 pr-3">{w.historyEnrolledAt}</th>
                    <th className="pb-2">{w.historySentAt}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row.id} className="border-b border-glass-border/50">
                      <td className="py-2 pr-3 text-ink">{row.email ?? row.customerId.slice(0, 8)}</td>
                      <td className="py-2 pr-3"><Badge tone={statusTone[row.status] ?? "neutral"}>{w[`status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}` as keyof typeof w] as string}</Badge></td>
                      <td className="py-2 pr-3 text-ink-soft">{fmtDateTime(row.enrolledAt, lang)}</td>
                      <td className="py-2 text-ink-soft">{row.sentAt ? fmtDateTime(row.sentAt, lang) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
