"use client";

import { useState, useTransition } from "react";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { resumeDrainAction, stopDrainAction } from "./deliveries-actions";

/**
 * Background-drain controls for one campaign run (P0-3, Deliveries tab). "Lanjutkan" re-arms a PAUSED
 * run (the human check the planDailySpread decision requires before a campaign continues across days);
 * "Hentikan" halts a draining or paused run. Both confirm, call the server action (which re-guards the
 * run's state), and on success the page revalidates so the row's state updates.
 */
export function DrainControlButtons({
  runId,
  resumable,
  stoppable,
}: {
  runId: string;
  resumable: boolean;
  stoppable: boolean;
}) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function onResume() {
    if (!window.confirm(d.resumeConfirm)) return;
    start(async () => {
      const res = await resumeDrainAction(runId);
      setNote(res.ok ? d.resumeOk : d.resumeFailed);
    });
  }
  function onStop() {
    if (!window.confirm(d.stopConfirm)) return;
    start(async () => {
      const res = await stopDrainAction(runId);
      setNote(res.ok ? d.stopOk : d.stopFailed);
    });
  }

  if (note) return <span className="font-body text-[12px] text-ink-faint">{note}</span>;
  return (
    <>
      {resumable && (
        <Button size="sm" variant="ghost" onClick={onResume} disabled={pending}>
          <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {d.resumeBtn}
        </Button>
      )}
      {stoppable && (
        <Button size="sm" variant="ghost" onClick={onStop} disabled={pending}>
          <Square className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {d.stopBtn}
        </Button>
      )}
    </>
  );
}
