"use client";

import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatDateTime } from "@/lib/i18n";
import {
  addTestRecipientAction,
  removeTestRecipientAction,
  type TestRecipient,
} from "./test-recipient-actions";

const inputCls =
  "h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red";

export function TestRecipientsPanel({ initial }: { initial: TestRecipient[] }) {
  const { lang, t } = useI18n();
  const p = t.campaignsPage.testRecipientsPanel;
  const [recipients, setRecipients] = useState(initial);
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onAdd() {
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setAdding(true);
    setNotice(null);
    try {
      const res = await addTestRecipientAction(clean, label.trim());
      if (!res.ok) {
        setNotice(res.error === "not_internal" ? p.errNotInternal : res.error === "denied" ? p.errDenied : p.errFailed);
        return;
      }
      // Optimistic: reload by re-fetching via server action isn't available here,
      // so add a placeholder that will be replaced on next page load.
      setRecipients((prev) => [
        { id: crypto.randomUUID(), email: clean, label: label.trim() || null, addedBy: null, addedAt: new Date().toISOString() },
        ...prev,
      ]);
      setEmail(""); setLabel("");
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(id: string) {
    setRemoving(id);
    setNotice(null);
    try {
      const res = await removeTestRecipientAction(id);
      if (!res.ok) { setNotice(p.removeFailed); return; }
      setRecipients((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="glass-strong flex flex-col gap-5 rounded-card p-5">
      <div>
        <h2 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{p.title}</h2>
        <p className="mt-1 font-body text-[13px] leading-relaxed text-ink-soft">{p.hint}</p>
      </div>

      {/* Add form */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="flex flex-col gap-1">
            <label className="font-body text-[11px] text-ink-faint">{p.addLabel}</label>
            <input
              type="email"
              className={inputCls + " w-full"}
              value={email}
              placeholder={p.addPlaceholder}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adding && onAdd()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-body text-[11px] text-ink-faint">{p.labelLabel}</label>
            <input
              type="text"
              className={inputCls + " w-full"}
              value={label}
              placeholder={p.labelPlaceholder}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adding && onAdd()}
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={onAdd} disabled={adding || !email.trim()}>
              {adding ? p.adding : <><UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />{p.addBtn}</>}
            </Button>
          </div>
        </div>
        {notice && <p role="alert" className="font-body text-[12px] text-red">{notice}</p>}
      </div>

      {/* List */}
      {recipients.length === 0 ? (
        <p className="font-body text-[13px] text-ink-soft">{p.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-sm border border-glass-border bg-glass px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="font-body text-[13px] text-ink">{r.email}</span>
                {r.label && <span className="ml-2 font-body text-[12px] text-ink-soft">· {r.label}</span>}
                {r.addedBy && (
                  <span className="ml-2 font-body text-[11px] text-ink-faint">
                    {p.addedBy}: {r.addedBy}
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label={p.removeBtn}
                disabled={removing === r.id}
                onClick={() => onRemove(r.id)}
                className="shrink-0 text-ink-faint transition-colors hover:text-red disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
