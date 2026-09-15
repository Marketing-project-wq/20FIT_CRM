"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Key, Shield, UserCog, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/lang-provider";
import {
  grantRoleAction,
  revokeRoleAction,
  loadRoleRowsAction,
  type RoleRowData,
} from "@/app/(app)/settings/roles/actions";
import { GRANTABLE_ROLES, type RoleActionError } from "@/lib/auth/role-admin";

function Identity({ email, userId, unresolvedLabel }: { email: string | null; userId: string; unresolvedLabel: string }) {
  if (email) return <>{email}</>;
  return (
    <span className="text-ink-faint">
      {userId}
      <span className="ml-1.5 rounded-sm bg-glass px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide not-italic text-ink-soft">
        {unresolvedLabel}
      </span>
    </span>
  );
}

function PermissionsSummary({ labels }: { labels: { title: string; sa: string; cm: string; v: string } }) {
  const items = [
    { role: "super_admin", icon: Shield, desc: labels.sa },
    { role: "crm_manager", icon: UserCog, desc: labels.cm },
    { role: "viewer", icon: Key, desc: labels.v },
  ];
  return (
    <div className="glass-strong rounded-card p-5">
      <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">{labels.title}</h3>
      <div className="mt-3 space-y-2">
        {items.map((it) => (
          <div key={it.role} className="flex items-start gap-2.5">
            <it.icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
            <div>
              <span className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">{it.role}</span>
              <p className="font-body text-[12px] leading-relaxed text-ink-soft">{it.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RolesPanel({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const g = t.audit;
  const [rows, setRows] = useState<RoleRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<RoleRowData | null>(null);
  const [editTarget, setEditTarget] = useState<RoleRowData | null>(null);
  const [editRole, setEditRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
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

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadRoleRowsAction();
      if (res.ok) setRows(res.rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function confirmRevoke() {
    if (!revokeTarget?.email) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await revokeRoleAction({ email: revokeTarget.email });
      if (r.ok) {
        setNotice({ ok: true, text: `${g.revokeOk}${r.email}` });
        await reload();
      } else {
        setNotice({ ok: false, text: errText(r.error) });
      }
    } catch {
      setNotice({ ok: false, text: g.grantErrWriteFailed });
    } finally {
      setBusy(false);
      setRevokeTarget(null);
    }
  }

  async function confirmEdit() {
    if (!editTarget?.email) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await grantRoleAction({ email: editTarget.email, role: editRole });
      if (r.ok) {
        setNotice({ ok: true, text: `${g.grantOk}${r.email} → ${r.role}` });
        await reload();
      } else {
        setNotice({ ok: false, text: errText(r.error) });
      }
    } catch {
      setNotice({ ok: false, text: g.grantErrWriteFailed });
    } finally {
      setBusy(false);
      setEditTarget(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">{g.rolesTitle}</h2>
        <p className="max-w-2xl font-body text-[13px] text-ink-soft">
          {g.rolesSubtitleA}<span className="font-mono text-[12px]">lib/auth/roles.ts</span>{g.rolesSubtitleB}
        </p>
      </div>

      {notice && (
        <div className="flex items-center gap-2">
          <Badge tone={notice.ok ? "green" : "red"}>{notice.ok ? "OK" : "!"}</Badge>
          <span className="font-body text-[13px] text-ink-soft">{notice.text}</span>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="rounded-card border border-glass-border px-4 py-10 text-center font-body text-[14px] text-ink-soft">
          {g.rolesEmpty}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-glass-border px-4 py-10 text-center font-body text-[14px] text-ink-soft">
          {g.rolesEmpty}
        </div>
      ) : (
        <>
          {/* Wide: table */}
          <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-bold">{g.thUser}</th>
                  <th className="px-4 py-3 font-bold">{g.thRole}</th>
                  <th className="px-4 py-3 font-bold">{g.thGranted}</th>
                  {canManage && <th className="px-4 py-3 font-bold">{/* actions */}</th>}
                </tr>
              </thead>
              <tbody className="font-body text-[14px] text-ink">
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b border-glass-border last:border-0">
                    <td className="px-4 py-3 font-mono text-[13px]">
                      <Identity email={r.email} userId={r.userId} unresolvedLabel={g.emailUnresolved} />
                    </td>
                    <td className="px-4 py-3"><Badge tone="neutral">{r.role}</Badge></td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {r.grantedAt ? r.grantedAt.slice(0, 10) : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditTarget(r); setEditRole(r.role); }}
                            className="rounded-sm border border-glass-border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
                          >
                            {g.editRole}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRevokeTarget(r)}
                            className="rounded-sm border border-red/30 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-red transition-colors hover:bg-red/10"
                          >
                            {g.revokeAccess}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow: cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <div key={r.userId} className="rounded-card border border-glass-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all font-mono text-[13px] text-ink">
                    <Identity email={r.email} userId={r.userId} unresolvedLabel={g.emailUnresolved} />
                  </span>
                  <Badge tone="neutral">{r.role}</Badge>
                </div>
                <p className="mt-1 font-mono text-[12px] text-ink-faint">
                  {g.thGranted}: {r.grantedAt ? r.grantedAt.slice(0, 10) : "—"}
                </p>
                {canManage && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditTarget(r); setEditRole(r.role); }}
                      className="rounded-sm border border-glass-border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
                    >
                      {g.editRole}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(r)}
                      className="rounded-sm border border-red/30 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-red transition-colors hover:bg-red/10"
                    >
                      {g.revokeAccess}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {canManage && (
        <PermissionsSummary labels={{ title: g.rolePermTitle, sa: g.rolePermSuperAdmin, cm: g.rolePermCrmManager, v: g.rolePermViewer }} />
      )}

      {/* Revoke confirm dialog */}
      <Dialog.Root open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-glass-border bg-surface p-6 shadow-xl">
            <Dialog.Title className="font-display text-[18px] font-bold uppercase tracking-wide text-ink">
              {g.revokeDialogTitle}
            </Dialog.Title>
            <Dialog.Description className="mt-2 font-body text-[14px] leading-relaxed text-ink-soft">
              {g.revokeDialogDesc.replace("{email}", revokeTarget?.email ?? revokeTarget?.userId ?? "")}
            </Dialog.Description>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <Button size="sm" onClick={confirmRevoke} disabled={busy}>
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

      {/* Edit role confirm dialog */}
      <Dialog.Root open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-glass-border bg-surface p-6 shadow-xl">
            <Dialog.Title className="font-display text-[18px] font-bold uppercase tracking-wide text-ink">
              {g.grantDialogTitle}
            </Dialog.Title>
            <div className="mt-3 space-y-3">
              <p className="font-body text-[14px] leading-relaxed text-ink-soft">
                {g.grantDialogDesc
                  .replace("{role}", editRole)
                  .replace("{email}", editTarget?.email ?? editTarget?.userId ?? "")}
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="font-body text-[12px] text-ink-soft">{g.grantRole}</span>
                <select
                  className="h-10 w-full rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  {GRANTABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              {/* Inline permissions hint */}
              <div className="rounded-sm bg-glass p-3">
                <p className="font-body text-[12px] text-ink-soft">
                  {editRole === "super_admin" && g.rolePermSuperAdmin}
                  {editRole === "crm_manager" && g.rolePermCrmManager}
                  {editRole === "viewer" && g.rolePermViewer}
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 rounded-sm border border-glass-border px-4 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <Button size="sm" onClick={confirmEdit} disabled={busy}>
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
    </section>
  );
}
