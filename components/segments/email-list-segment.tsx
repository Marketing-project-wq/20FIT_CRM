"use client";

import { useState } from "react";
import { Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { saveEmailListSegmentAction } from "@/app/(app)/segments/actions";

/**
 * Manual (static) email-list segment: paste a list of emails, name it, save. Targets exactly those
 * addresses at send via overrideRecipients — never touches master_customer. For admin testing lists
 * or any fixed send list. Suppression still applies at send.
 */
export function EmailListSegment({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const m = t.campaignsPage.emailListSegment;
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const count = Array.from(
    new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))),
  ).length;

  async function onSave() {
    if (!name.trim() || count === 0 || saving) return;
    setSaving(true); setMsg(null);
    try {
      const res = await saveEmailListSegmentAction({ name: name.trim(), emailsRaw: emails });
      if (!res.ok) {
        setMsg(res.error === "no_valid_emails" ? m.errNoEmails : res.error === "empty_name" ? m.errName : m.errSave);
        return;
      }
      setName(""); setEmails(""); setMsg(m.saved);
      onSaved();
    } finally {
      setSaving(false);
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
      <label className="flex flex-col gap-1.5">
        <span className="font-body text-[12px] text-ink-soft">{m.nameLabel}</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={m.namePlaceholder} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-body text-[12px] text-ink-soft">{m.emailsLabel}</span>
        <textarea
          className="min-h-[96px] w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={m.emailsPlaceholder}
        />
      </label>
      <p className="font-body text-[12px] text-ink-faint">{m.countPre}{count}{m.countPost}</p>
      {msg && <p className="font-body text-[13px] text-ink-soft">{msg}</p>}
      <div>
        <Button size="sm" onClick={onSave} disabled={saving || !name.trim() || count === 0}>
          <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />{m.saveBtn}
        </Button>
      </div>
    </div>
  );
}
