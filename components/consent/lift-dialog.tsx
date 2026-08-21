"use client";

import { useState } from "react";
import { Undo2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LIFTED_REASON_MAX } from "@/lib/crm/suppression-input";
import { useI18n } from "@/components/i18n/lang-provider";

const inputTextarea =
  "flex min-h-[72px] w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red focus-visible:border-transparent";

/**
 * Lift a suppression. Requires a reason (never a silent, unaudited hand-edit) and states
 * plainly that lifting RE-ENABLES contact. Zero DELETE — the row stays, status flips.
 */
export function LiftSuppressionDialog({
  open,
  onOpenChange,
  suppressionId,
  identityLabel,
  onLifted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppressionId: string;
  identityLabel: string; // e.g. "phone · 62812****8953"
  onLifted?: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setReason("");
      setError(null);
      setDone(null);
    }, 150);
  }

  async function submit() {
    setError(null);
    if (reason.trim() === "") return setError(t.consent.apiMissingLiftReason);
    setBusy(true);
    try {
      const res = await fetch("/api/suppression/lift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: suppressionId, lifted_reason: reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `${t.consent.valLiftFailed} (HTTP ${res.status}).`);
        return;
      }
      setDone(data?.message ?? t.consent.warn.srvLiftSuccess);
      onLifted?.();
    } catch {
      setError(t.consent.connFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-red" aria-hidden /> {t.consent.liftTitle}
          </DialogTitle>
          <DialogDescription>
            {t.consent.warn.liftDescA}<span className="font-mono text-[13px] text-ink">{identityLabel}</span>{t.consent.warn.liftDescB}
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lift-reason">{t.consent.liftReasonLabel}</Label>
              <textarea
                id="lift-reason"
                value={reason}
                maxLength={LIFTED_REASON_MAX}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.consent.liftPlaceholder}
                className={inputTextarea}
              />
              <p className="text-right font-mono text-[11px] text-ink-faint">
                {reason.length}/{LIFTED_REASON_MAX}
              </p>
            </div>
            {error && (
              <div className="tint-red rounded-sm px-3 py-2 font-body text-[13px] text-ink">{error}</div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={close} disabled={busy}>
                {t.consent.cancel}
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? t.consent.lifting : t.consent.liftConfirm}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-card border border-glass-border p-4">
              <Check className="mt-0.5 h-5 w-5 text-red" aria-hidden />
              <div>
                <Badge tone="neutral">{t.consent.lifted}</Badge>
                <p className="mt-2 font-body text-[14px] leading-relaxed text-ink">{done}</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={close}>{t.consent.done}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
