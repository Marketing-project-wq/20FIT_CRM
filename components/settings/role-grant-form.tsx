"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { grantRoleAction, revokeRoleAction } from "@/app/(app)/settings/roles/actions";
import { GRANTABLE_ROLES, type RoleActionError } from "@/lib/auth/role-admin";

const inputCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/**
 * Role management form — rendered ONLY for super_admin (the page decides). Add / change (upsert) and
 * revoke by email. The server action re-checks canManageRoles and runs the safety rules regardless, so
 * this is a convenience surface, not the gate. Every action is audited (role.granted / role.revoked,
 * permanently retained), and the biting rules — no self-demote, protect the last Super Admin — are
 * enforced server-side and surfaced here as clear errors. K-43 / FINAL TUGAS 4.
 */
export function RoleGrantForm() {
  const { t } = useI18n();
  const g = t.audit;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [busy, setBusy] = useState<null | "grant" | "revoke">(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

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

  async function onGrant() {
    if (!email.trim()) return;
    setBusy("grant");
    setNotice(null);
    try {
      const r = await grantRoleAction({ email, role });
      setNotice(r.ok ? { ok: true, text: `${g.grantOk}${r.email} → ${r.role}` } : { ok: false, text: errText(r.error) });
    } catch {
      setNotice({ ok: false, text: g.grantErrWriteFailed });
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke() {
    if (!email.trim()) return;
    if (!window.confirm(g.revokeConfirm)) return;
    setBusy("revoke");
    setNotice(null);
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
        <Button size="sm" onClick={onGrant} disabled={busy !== null || !email.trim()}>
          {busy === "grant" ? g.granting : g.grantBtn}
        </Button>
        <button
          type="button"
          onClick={onRevoke}
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
    </section>
  );
}
