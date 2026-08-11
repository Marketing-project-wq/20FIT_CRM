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
    if (!kind) return setError("Pilih identitas mana yang disuppress.");
    if (props.mode === "direct" && value.trim() === "") return setError("Isi nomor telepon atau email.");
    if (!reason) return setError("Pilih alasan permintaan.");
    setBusy(true);
    try {
      const res = await fetch("/api/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bodyBase(), dry_run: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `Gagal meninjau (HTTP ${res.status}).`);
        return;
      }
      setDry({ identity_kind: data.identity_kind, identity_key: data.identity_key, will_do: data.will_do });
      setStep("review");
    } catch {
      setError("Gagal terhubung ke server.");
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
        setError(data?.message ?? `Gagal mencatat (HTTP ${res.status}).`);
        return;
      }
      setConsequence(data?.message ?? "Tercatat.");
      setStep("done");
      onRecorded?.();
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  const willDoNote =
    dry?.will_do === "noop"
      ? "Sudah ada suppression AKTIF untuk identitas ini — mencatat lagi tidak mengubah apa pun."
      : dry?.will_do === "reactivate"
        ? "Identitas ini pernah disuppress lalu dicabut — ini akan MENGAKTIFKAN kembali."
        : "Baris suppression baru akan dibuat.";

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red" aria-hidden /> Catat permintaan berhenti dihubungi
          </DialogTitle>
          <DialogDescription>
            Mencatat permintaan yang <strong>sudah terjadi</strong> — seseorang minta berhenti dihubungi.
            Ini bukan menghukum siapa pun; ini melindungi mereka. Nol tombol hapus: pencabutan lewat
            jalur tersendiri.
          </DialogDescription>
        </DialogHeader>

        {step === "compose" && (
          <div className="space-y-4">
            {/* Identity choice — ALWAYS explicit (never silently write one or both). */}
            <div className="space-y-2">
              <Label>Identitas yang disuppress</Label>
              {props.mode === "profile" ? (
                profileKinds.length === 0 ? (
                  <p className="font-body text-[13px] text-ink-soft">
                    Profil ini tidak punya telepon maupun email untuk disuppress.
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
                          {k === "phone" ? "Telepon" : "Email"}
                        </span>
                        <span className="font-mono text-[13px] text-ink">
                          {k === "phone" ? props.phone : props.email}
                        </span>
                      </label>
                    ))}
                    <p className="font-body text-[12px] text-ink-faint">
                      Hanya identitas yang dipilih yang disuppress. Untuk menutup keduanya, catat dua kali.
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
                        {k === "phone" ? "Telepon" : "Email"}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={kind === "phone" ? "mis. 0812… atau 62812…" : "mis. nama@domain.com"}
                    inputMode={kind === "phone" ? "tel" : "email"}
                  />
                  <p className="font-body text-[12px] text-ink-faint">
                    Dinormalkan di server ({kind === "phone" ? "62… tanpa +" : "huruf kecil"}) sebelum ditulis.
                    Bentuk akhirnya ditampilkan di langkah tinjauan.
                  </p>
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Alasan</Label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red"
              >
                <option value="">— pilih alasan —</option>
                {RECORD_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Detail (free text, capped) */}
            <div className="space-y-2">
              <Label htmlFor="detail">Catatan (opsional)</Label>
              <textarea
                id="detail"
                value={detail}
                maxLength={REASON_DETAIL_MAX}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Konteks singkat, mis. “minta stop lewat WA 11 Agu”."
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
                Batal
              </Button>
              <Button onClick={review} disabled={busy || (props.mode === "profile" && profileKinds.length === 0)}>
                {busy ? "Meninjau…" : "Tinjau"} <ArrowRight className="h-4 w-4" />
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
                  Akan ditulis
                </span>
              </div>
              <div className="mt-3 space-y-1 font-body text-[14px] text-ink">
                <div>
                  <span className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-faint">
                    {dry.identity_kind === "phone" ? "Telepon" : "Email"}:
                  </span>{" "}
                  <span className="font-mono text-[13px]">{dry.identity_key}</span>
                </div>
                <p className="font-body text-[13px] text-ink-soft">{willDoNote}</p>
              </div>
            </div>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              Setelah dicatat, identitas ini <strong>tidak bisa dihubungi</strong> untuk marketing apa pun
              status consent-nya. Baris ini adalah catatan permintaan orang sungguhan — <strong>tidak dihapus</strong>,
              hanya bisa dicabut (dengan alasan dan audit).
            </p>

            {error && (
              <div className="tint-red rounded-sm px-3 py-2 font-body text-[13px] text-ink">{error}</div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setStep("compose")} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> Ubah
              </Button>
              <Button onClick={confirm} disabled={busy}>
                {busy ? "Mencatat…" : "Catat permintaan"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-card border border-glass-border p-4">
              <Check className="mt-0.5 h-5 w-5 text-red" aria-hidden />
              <div>
                <Badge tone="red">Tercatat</Badge>
                <p className="mt-2 font-body text-[14px] leading-relaxed text-ink">{consequence}</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={close}>Selesai</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
