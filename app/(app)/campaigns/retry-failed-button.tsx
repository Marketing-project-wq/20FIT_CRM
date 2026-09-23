"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { retryFailedAction } from "./deliveries-actions";

export function RetryFailedButton({ runId, failedCount }: { runId: string; failedCount: number }) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(d.retryFailedConfirm.replace("{n}", String(failedCount)))) return;
    start(async () => {
      const res = await retryFailedAction(runId);
      setNote(res.ok ? d.retryFailedOk.replace("{n}", String(res.cleared ?? failedCount)) : d.retryFailedFailed);
    });
  }

  if (note) return <span className="font-body text-[12px] text-ink-faint">{note}</span>;
  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={pending} className="text-red">
      <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      {d.retryFailedBtn} ({failedCount})
    </Button>
  );
}
