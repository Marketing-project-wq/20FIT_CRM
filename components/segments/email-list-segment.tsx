"use client";

import { useState } from "react";
import { Mail, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import {
  saveEmailListSegmentAction,
  previewEmailListAction,
  parseEmailCsvAction,
  type EmailListPreview,
} from "@/app/(app)/segments/actions";
import { parseEmailListInput } from "@/lib/crm/email-list";

/**
 * Manual (static) email-list segment: paste OR upload a CSV, PREVIEW how many resolve in the pool,
 * name it, save. Targets exactly those addresses at send via overrideRecipients — never touches
 * master_customer, never creates people (addresses not in the pool are reported, not inserted).
 * Suppression still applies at send. K-40: it is a SNAPSHOT (see snapshotNote).
 */
export function EmailListSegment({ onSaved }: { onSaved: (segmentId?: string) => void }) {
  const { t } = useI18n();
  const m = t.campaignsPage.emailListSegment;
  const [name, setName] = useState("");
  const [source, setSource] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  // CSV state
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [column, setColumn] = useState<string | null>(null);
  const [needsColumn, setNeedsColumn] = useState(false);
  const [csvEmails, setCsvEmails] = useState<string[]>([]);
  // Preview + save
  const [preview, setPreview] = useState<EmailListPreview | null>(null);
  const [previewSig, setPreviewSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // The current working list, from whichever source is active.
  const emails = source === "paste" ? parseEmailListInput(pasteText) : csvEmails;
  const sig = emails.join("|");
  const previewFresh = preview !== null && previewSig === sig;
  const canSave = !busy && name.trim() !== "" && emails.length > 0 && previewFresh;

  function resetPreview() {
    setPreview(null);
    setPreviewSig(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg(null); resetPreview();
    try {
      const text = await file.text();
      setCsvText(text);
      setFileName(file.name);
      const res = await parseEmailCsvAction({ csvText: text });
      if (!res.ok) { setMsg(res.error === "empty_file" ? m.errNoEmails : m.errSave); return; }
      setHeaders(res.headers);
      setColumn(res.column);
      setNeedsColumn(res.column === null);
      setCsvEmails(res.emails);
    } catch {
      setMsg(m.errSave);
    } finally {
      setBusy(false);
    }
  }

  async function onColumn(col: string) {
    setBusy(true); setMsg(null); resetPreview();
    try {
      const res = await parseEmailCsvAction({ csvText, emailColumn: col });
      if (!res.ok) { setMsg(m.errSave); return; }
      setColumn(res.column);
      setNeedsColumn(res.column === null);
      setCsvEmails(res.emails);
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    if (emails.length === 0 || busy) return;
    setBusy(true); setMsg(null); setPreview(null);
    try {
      const res = await previewEmailListAction({ emails });
      if (!res.ok) {
        setMsg(res.error === "too_many_emails" ? m.errTooMany : res.error === "no_valid_emails" ? m.errNoEmails : m.previewFailed);
        return;
      }
      setPreview(res);
      setPreviewSig(sig);
    } catch {
      setMsg(m.previewFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!canSave) return;
    setBusy(true); setMsg(null);
    try {
      const res = await saveEmailListSegmentAction({ name: name.trim(), emailsRaw: emails.join("\n") });
      if (!res.ok) {
        setMsg(res.error === "no_valid_emails" ? m.errNoEmails : res.error === "empty_name" ? m.errName : res.error === "too_many_emails" ? m.errTooMany : m.errSave);
        return;
      }
      setName(""); setPasteText(""); setCsvEmails([]); setCsvText(""); setFileName(""); setHeaders([]); setColumn(null);
      resetPreview();
      setMsg(m.saved);
      onSaved(res.segmentId);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-ink-soft">
        <Mail className="h-4 w-4" aria-hidden />
        <p className="font-body text-[13px]">{m.hint}</p>
      </div>
      {/* Auto-filter vs manual-list, said in one line so the choice is clear (TUGAS 3). */}
      <p className="font-body text-[12px] text-ink-faint">{m.choiceHint}</p>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-[12px] text-ink-soft">{m.nameLabel}</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={m.namePlaceholder} />
      </label>

      {/* Source: paste OR upload — side by side (a short list is faster to paste). */}
      <div className="flex gap-2">
        {(["paste", "csv"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setSource(s); resetPreview(); setMsg(null); }}
            className={`rounded-sm border px-3 py-1 font-body text-[12px] ${source === s ? "border-red tint-red text-ink" : "border-glass-border text-ink-soft hover:text-ink"}`}
          >
            {s === "paste" ? m.pasteLabel : m.uploadLabel}
          </button>
        ))}
      </div>

      {source === "paste" ? (
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{m.emailsLabel}</span>
          <textarea
            className="min-h-[96px] w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); resetPreview(); }}
            placeholder={m.emailsPlaceholder}
          />
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-body text-[12px] text-ink-faint">{m.uploadHint}</p>
          <label className="flex cursor-pointer items-center gap-2 self-start rounded-sm border border-dashed border-glass-border px-3 py-2 font-body text-[13px] text-ink hover:border-red">
            <Upload className="h-4 w-4 text-ink-faint" aria-hidden />
            <span>{fileName || m.pickFile}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} disabled={busy} />
          </label>
          {headers.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="font-body text-[12px] text-ink-soft">{m.columnLabel}</span>
              {needsColumn && <span className="font-body text-[12px] text-amber">{m.columnPickHint}</span>}
              <select
                className={inputCls}
                value={column ?? ""}
                onChange={(e) => onColumn(e.target.value)}
              >
                <option value="" disabled>—</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <p className="font-body text-[12px] text-ink-faint">{m.countPre}{emails.length}{m.countPost}</p>

      {/* Preview BEFORE save — the four numbers, so a 141-list that is really 90 in the pool is known
          first, not discovered at send (TUGAS 2.4). Save stays disabled until a fresh preview exists. */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onPreview} disabled={busy || emails.length === 0}>
          {busy ? m.previewing : m.previewBtn}
        </Button>
        {!previewFresh && emails.length > 0 && <span className="font-body text-[12px] text-ink-faint">{m.previewFirst}</span>}
      </div>
      {previewFresh && preview && (
        <div className="grid grid-cols-2 gap-2 rounded-card tint-neutral p-3 sm:grid-cols-4">
          <Stat label={m.previewRead} value={preview.read} />
          <Stat label={m.previewMatched} value={preview.matched} tone="green" />
          <Stat label={m.previewNotInPool} value={preview.notInPool} tone={preview.notInPool > 0 ? "amber" : undefined} />
          <Stat label={m.previewSuppressed} value={preview.suppressed} tone={preview.suppressed > 0 ? "amber" : undefined} />
        </div>
      )}

      {/* Snapshot + "import first" — stated, never inferred (TUGAS 2.5 / 3). */}
      <p className="font-body text-[12px] leading-relaxed text-ink-faint">{m.snapshotNote}</p>
      {previewFresh && preview && preview.notInPool > 0 && (
        <p className="font-body text-[12px] leading-relaxed text-amber">{m.notInPoolHint}</p>
      )}

      {msg && <p className="font-body text-[13px] text-ink-soft">{msg}</p>}
      <div>
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />{m.saveBtn}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  const colour = tone === "green" ? "text-green" : tone === "amber" ? "text-amber" : "text-ink";
  return (
    <div>
      <p className={`font-display text-[20px] font-semibold leading-none tabular-nums ${colour}`}>{value}</p>
      <p className="mt-1 font-body text-[11px] leading-snug text-ink-soft">{label}</p>
    </div>
  );
}
