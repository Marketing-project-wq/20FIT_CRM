"use client";

import { useState } from "react";
import { Ban, ArrowRight, ArrowLeft, ShieldAlert, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RECORD_REASONS,
  REASON_DETAIL_MAX,
  type IdentityKind,
} from "@/lib/crm/suppression-input";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Dict } from "@/lib/i18n";

/** RECORD_REASONS `value`s are stored codes (never translated); their labels come from the dict. */
function reasonLabel(t: Dict, value: string): string {
  switch (value) {
    case "user_request":
      return t.consent.reasonUserRequest;
    case "complaint":
      return t.consent.reasonComplaint;
    case "bounce":
      return t.consent.reasonBounce;
    case "legal":
      return t.consent.reasonLegal;
    default:
      return value;
  }
}

interface CommonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded?: () => void;
}
type Props =
  | (CommonProps & {
      mode: "profile";
      customerId: string;
      phone: string | null;
      email: string | null;
      personName?: string | null;
    })
  | (CommonProps & { mode: "direct" });

type Step = "compose" | "review" | "done";

interface DryRun {
  identity_kind: IdentityKind;
  identity_key: string; // clear for view_contact roles, masked otherwise
  will_do: "insert" | "reactivate" | "noop";
}

const inputTextarea =
  "flex min-h-[72px] w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red focus-visible:border-transparent";

export function SuppressionForm(props: Props) {
  const { t } = useI18n();
  const { open, onOpenChange, onRecorded } = props;
  const profileKinds: IdentityKind[] =
    props.mode === "profile"
      ? ([props.phone ? "phone" : null, props.email ? "email" : null].filter(Boolean) as IdentityKind[])
      : [];

  const [kind, setKind] = useState<IdentityKind | null>(
    props.mode === "profile" ? (profileKinds[0] ?? null) : "phone",
  );
  const [value, setValue] = useState(""); // direct mode only
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [step, setStep] = useState<Step>("compose");
  const [dry, setDry] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consequence, setConsequence] = useState<string | null>(null);

  function reset() {
    setStep("compose");
    setDry(null);
    setError(null);
    setConsequence(null);
    setValue("");
    setDetail("");
    setReason("");
    setKind(props.mode === "profile" ? (profileKinds[0] ?? null) : "phone");
  }

  function close() {
    onOpenChange(false);
    // Defer reset so the closing animation doesn't flash the compose step.
    setTimeout(reset, 150);
  }

  function bodyBase() {
    return props.mode === "profile"
      ? { customer_id: props.customerId, identity_kind: kind, reason_code: reason, reason_detail: detail }
      : { identity_kind: kind, identity_value: value, reason_code: reason, reason_detail: detail };
  }

  async function review() {
    setError(null);
    if (!kind) return setError(t.consent.valPickIdentity);
    if (props.mode === "direct" && value.trim() === "") return setError(t.consent.valFillIdentity);
    if (!reason) return setError(t.consent.valPickReason);
    setBusy(true);
    try {
      const res = await fetch("/api/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bodyBase(), dry_run: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `${t.consent.valReviewFailed} (HTTP ${res.status}).`);
        return;
      }
      setDry({ identity_kind: data.identity_kind, identity_key: data.identity_key, will_do: data.will_do });
      setStep("review");
    } catch {
      setError(t.consent.connFailed);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyBase()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `${t.consent.valRecordFailed} (HTTP ${res.status}).`);
        return;
      }
      setConsequence(data?.message ?? t.consent.recorded);
      setStep("done");
      onRecorded?.();
    } catch {
      setError(t.consent.connFailed);
    } finally {
      setBusy(false);
    }
  }

  const willDoNote =
    dry?.will_do === "noop"
      ? t.consent.warn.willDoNoop
      : dry?.will_do === "reactivate"
        ? t.consent.warn.willDoReactivate
        : t.consent.warn.willDoInsert;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red" aria-hidden /> {t.consent.formTitle}
          </DialogTitle>
          <DialogDescription>
            {t.consent.warn.formDesc}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" && (
          <div className="space-y-4">
            {/* Identity choice — ALWAYS explicit (never silently write one or both). */}
            <div className="space-y-2">
              <Label>{t.consent.fldIdentity}</Label>
              {props.mode === "profile" ? (
                profileKinds.length === 0 ? (
                  <p className="font-body text-[13px] text-ink-soft">
                    {t.consent.noContactToSuppress}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {profileKinds.map((k) => (
                      <label
                        key={k}
                        className="flex cursor-pointer items-center gap-3 rounded-sm border border-glass-border bg-glass px-3 py-2"
                      >
                        <input
                          type="radio"
                          name="identity-kind"
                          checked={kind === k}
                          onChange={() => setKind(k)}
                          className="accent-red"
                        />
                        <span className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">
                          {k === "phone" ? t.consent.kindPhone : t.consent.kindEmail}
                        </span>
                        <span className="font-mono text-[13px] text-ink">
                          {k === "phone" ? props.phone : props.email}
                        </span>
                      </label>
                    ))}
                    <p className="font-body text-[12px] text-ink-faint">
                      {t.consent.onlySelectedNote}
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {(["phone", "email"] as IdentityKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={`flex-1 rounded-sm border px-3 py-2 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${
                          kind === k
                            ? "tint-red border-red"
                            : "border-glass-border text-ink-soft hover:bg-glass"
                        }`}
                      >
                        {k === "phone" ? t.consent.kindPhone : t.consent.kindEmail}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={kind === "phone" ? t.consent.directPhonePlaceholder : t.consent.directEmailPlaceholder}
                    inputMode={kind === "phone" ? "tel" : "email"}
                  />
                  <p className="font-body text-[12px] text-ink-faint">
                    {t.consent.normalizeNoteA}{kind === "phone" ? t.consent.normalizePhone : t.consent.normalizeEmail}{t.consent.normalizeNoteB}
                  </p>
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">{t.consent.fldReason}</Label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red"
              >
                <option value="">{t.consent.reasonPlaceholder}</option>
                {RECORD_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {reasonLabel(t, r.value)}
                  </option>
                ))}
              </select>
            </div>

            {/* Detail (free text, capped) */}
            <div className="space-y-2">
              <Label htmlFor="detail">{t.consent.fldDetail}</Label>
              <textarea
                id="detail"
                value={detail}
                maxLength={REASON_DETAIL_MAX}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={t.consent.detailPlaceholder}
                className={inputTextarea}
              />
              <p className="text-right font-mono text-[11px] text-ink-faint">
                {detail.length}/{REASON_DETAIL_MAX}
              </p>
            </div>

            {error && (
              <div className="tint-red rounded-sm px-3 py-2 font-body text-[13px] text-ink">{error}</div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={close} disabled={busy}>
                {t.consent.cancel}
              </Button>
              <Button onClick={review} disabled={busy || (props.mode === "profile" && profileKinds.length === 0)}>
                {busy ? t.consent.reviewing : t.consent.review} <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && dry && (
          <div className="space-y-4">
            <div className="tint-amber rounded-card p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" aria-hidden />
                <span className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
                  {t.consent.willWrite}
                </span>
              </div>
              <div className="mt-3 space-y-1 font-body text-[14px] text-ink">
                <div>
                  <span className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">
                    {dry.identity_kind === "phone" ? t.consent.kindPhone : t.consent.kindEmail}:
                  </span>{" "}
                  <span className="font-mono text-[13px]">{dry.identity_key}</span>
                </div>
                <p className="font-body text-[13px] text-ink-soft">{willDoNote}</p>
              </div>
            </div>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              {t.consent.warn.reviewConsequence}
            </p>

            {error && (
              <div className="tint-red rounded-sm px-3 py-2 font-body text-[13px] text-ink">{error}</div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setStep("compose")} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> {t.consent.change}
              </Button>
              <Button onClick={confirm} disabled={busy}>
                {busy ? t.consent.recording : t.consent.recordConfirm}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-card border border-glass-border p-4">
              <Check className="mt-0.5 h-5 w-5 text-red" aria-hidden />
              <div>
                <Badge tone="red">{t.consent.recorded}</Badge>
                <p className="mt-2 font-body text-[14px] leading-relaxed text-ink">{consequence}</p>
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
