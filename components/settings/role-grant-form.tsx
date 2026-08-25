"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { grantRoleAction, GRANTABLE_ROLES } from "@/app/(app)/settings/roles/actions";

const inputCls =
  "h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/**
 * Role-grant form — rendered ONLY for super_admin (the page decides). The server action re-checks
 * canManageRoles regardless, so this is a convenience surface, not the gate. Grants are audited
 * (role.granted, permanently retained). K-43.
 */
export function RoleGrantForm() {
  const { t } = useI18n();
  const g = t.audit;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const errText = (e: string | undefined): string => {
    switch (e) {
      case "denied": return g.grantErrDenied;
      case "bad_role": return g.grantErrBadRole;
      case "user_not_found": return g.grantErrUserNotFound;
      default: return g.grantErrWriteFailed;
    }
  };

  async function onSubmit() {
    if (!email.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await grantRoleAction({ email, role });
      setNotice(r.ok ? { ok: true, text: `${g.grantOk}${r.email} → ${r.role}` } : { ok: false, text: errText(r.error) });
    } catch {
      setNotice({ ok: false, text: g.grantErrWriteFailed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-strong flex flex-col gap-3 rounded-card p-5">
      <div>
        <h3 className="font-body text-[13px] font-semibold text-ink">{g.grantTitle}</h3>
        <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">{g.grantDesc}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
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
        <Button size="sm" onClick={onSubmit} disabled={busy || !email.trim()}>
          {busy ? g.granting : g.grantBtn}
        </Button>
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
