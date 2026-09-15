"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { grantRoleAction, revokeRoleAction } from "@/app/(app)/settings/roles/actions";
import { GRANTABLE_ROLES, type RoleActionError } from "@/lib/auth/role-admin";

const inputCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

export function RoleGrantForm() {
  const { t } = useI18n();
  const g = t.audit;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [busy, setBusy] = useState<null | "grant" | "revoke">(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const errText = (e: RoleActionError | undefined): string => {
    switch (e) {
      case "denied": return g.grantErrDenied;
      case "bad_role": return g.grantErrBadRole;
      case "user_not_found": return g.grantErrUserNotFound;
      case "self_demote": return g.grantErrSelfDemote;
      case "last_super_admin": return g.grantErrLastSuperAdmin;
      case "not_assigned": return g.grantErrNotAssigned;
      default: return g.grantErrWriteFailed;
    }
  };

  async function doGrant() {
    if (!email.trim()) return;
    setBusy("grant");
    setNotice(null);
    setConfirmGrant(false);
    try {
      const r = await grantRoleAction({ email, role });
      setNotice(r.ok ? { ok: true, text: `${g.grantOk}${r.email} → ${r.role}` } : { ok: false, text: errText(r.error) });
    } catch {
      setNotice({ ok: false, text: g.grantErrWriteFailed });
    } finally {
      setBusy(null);
    }
  }

  async function doRevoke() {
    if (!email.trim()) return;
    setBusy("revoke");
    setNotice(null);
    setConfirmRevoke(false);
    try {
      const r = await revokeRoleAction({ email });
      setNotice(r.ok ? { ok: true, text: `${g.revokeOk}${r.email}` } : { ok: false, text: errText(r.error) });
    } catch {
      setNotice({ ok: false, text: g.grantErrWriteFailed });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="glass-strong flex flex-col gap-3 rounded-card p-5">
      <div>
        <h3 className="font-body text-[13px] font-semibold text-ink">{g.grantTitle}</h3>
        <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">{g.grantDesc}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{g.grantEmail}</span>
          <input className={inputCls} type="email" value={email} placeholder={g.grantEmailPh} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-[12px] text-ink-soft">{g.grantRole}</span>
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            {GRANTABLE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setConfirmGrant(true)} disabled={busy !== null || !email.trim()}>
          {busy === "grant" ? g.granting : g.grantBtn}
        </Button>
        <button
          type="button"
          onClick={() => setConfirmRevoke(true)}
          disabled={busy !== null || !email.trim()}
          className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "revoke" ? g.revoking : g.revokeBtn}
        </button>
      </div>
      {notice && (
        <div className="flex items-center gap-2">
          <Badge tone={notice.ok ? "green" : "red"}>{notice.ok ? "OK" : "!"}</Badge>
          <span className="font-body text-[13px] text-ink-soft">{notice.text}</span>
        </div>
      )}

      {/* Grant confirm dialog */}
      <Dialog.Root open={confirmGrant} onOpenChange={setConfirmGrant}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-glass-border bg-surface p-6 shadow-xl">
            <Dialog.Title className="font-display text-[18px] font-bold uppercase tracking-wide text-ink">
              {g.grantDialogTitle}
            </Dialog.Title>
            <Dialog.Description className="mt-2 font-body text-[14px] leading-relaxed text-ink-soft">
              {g.grantDialogDesc.replace("{role}", role).replace("{email}", email)}
            </Dialog.Description>
            <div className="mt-3 rounded-sm bg-glass p-3">
              <p className="font-body text-[12px] text-ink-soft">
                {role === "super_admin" && g.rolePermSuperAdmin}
                {role === "crm_manager" && g.rolePermCrmManager}
                {role === "viewer" && g.rolePermViewer}
              </p>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass">
                  Cancel
                </button>
              </Dialog.Close>
              <Button size="sm" onClick={doGrant} disabled={busy !== null}>
                {g.grantDialogConfirm}
              </Button>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="absolute right-3 top-3 rounded-sm p-1.5 text-ink-faint hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Revoke confirm dialog */}
      <Dialog.Root open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-glass-border bg-surface p-6 shadow-xl">
            <Dialog.Title className="font-display text-[18px] font-bold uppercase tracking-wide text-ink">
              {g.revokeDialogTitle}
            </Dialog.Title>
            <Dialog.Description className="mt-2 font-body text-[14px] leading-relaxed text-ink-soft">
              {g.revokeDialogDesc.replace("{email}", email)}
            </Dialog.Description>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass">
                  Cancel
                </button>
              </Dialog.Close>
              <Button size="sm" onClick={doRevoke} disabled={busy !== null}>
                {g.revokeDialogConfirm}
              </Button>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="absolute right-3 top-3 rounded-sm p-1.5 text-ink-faint hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
