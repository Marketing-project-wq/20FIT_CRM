"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { sendPreviewEmailAction } from "./actions";

export function PreviewEmailPanel({ templateKey }: { templateKey: string }) {
  const { t } = useI18n();
  const [emails, setEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sentTo?: string[]; error?: string } | null>(null);

  async function onSend() {
    const targets = emails.split(/[,\n]/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (targets.length === 0) return;
    setSending(true); setResult(null);
    try {
      const r = await sendPreviewEmailAction(targets, templateKey);
      setResult(r.ok ? { ok: true, sentTo: r.sentTo } : { ok: false, error: r.error ?? "send_failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-1">
          {t.campaignsPage.steps.step3TestTitle}
        </p>
        <p className="font-body text-[12px] text-ink-faint">
          Kirim preview template ini ke satu atau beberapa email. Pisahkan dengan koma atau baris baru.
        </p>
      </div>
      <textarea
        className="min-h-[72px] w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="admin@20fit.id, tifany@20fit.id"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={onSend} disabled={sending || !emails.trim() || !templateKey}>
          {sending ? "Mengirim…" : "Kirim preview"}
        </Button>
      </div>
      {result?.ok && (
        <div className="flex flex-wrap gap-2">
          {result.sentTo?.map((e) => (
            <Badge key={e} tone="green">✓ {e}</Badge>
          ))}
        </div>
      )}
      {result && !result.ok && (
        <p role="alert" className="font-body text-[12px] text-red">
          {result.error === "missing_env" ? "Mailtrap belum dikonfigurasi." :
           result.error === "no_template" ? "Template tidak ditemukan." :
           "Gagal mengirim email preview."}
        </p>
      )}
    </div>
  );
}
