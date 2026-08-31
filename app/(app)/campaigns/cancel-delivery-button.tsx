"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import { cancelScheduledSendAction } from "./deliveries-actions";

/** Cancel button for one pending scheduled send (Deliveries tab). Confirms, calls the action, and on
 *  success the page revalidates so the row drops out of "upcoming". */
export function CancelDeliveryButton({ id }: { id: string }) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function onCancel() {
    if (!window.confirm(d.cancelConfirm)) return;
    start(async () => {
      const res = await cancelScheduledSendAction(id);
      setNote(res.ok ? d.cancelOk : d.cancelFailed);
    });
  }

  if (note) return <span className="font-body text-[12px] text-ink-faint">{note}</span>;
  return (
    <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
      <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      {d.cancel}
    </Button>
  );
}
