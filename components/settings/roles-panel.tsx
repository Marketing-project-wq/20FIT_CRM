import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";

/**
 * Roles panel — read-only list of crm_user_role, resolved via the service-role client
 * (RLS ON, zero policy -> only the admin client can read it). Shared by /settings and
 * the focused /settings/roles route so the two never drift. The CALLER owns the
 * audit.view gate; this component assumes it has already passed.
 */

type RoleRow = { user_id: string; role: string; granted_at: string | null };

type LoadResult =
  | { state: "ready"; rows: RoleRow[]; emails: Record<string, string> }
  | { state: "not_provisioned" };

async function loadRoleRows(): Promise<LoadResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_user_role")
      .select("user_id, role, granted_at")
      .order("granted_at", { ascending: true });
    if (error) return { state: "not_provisioned" };

    const rows = (data ?? []) as RoleRow[];
    const emails: Record<string, string> = {};
    try {
      const { data: list } = await admin.auth.admin.listUsers();
      for (const u of list?.users ?? []) if (u.email) emails[u.id] = u.email;
    } catch {
      // Email resolution is best-effort; fall back to the user_id.
    }
    return { state: "ready", rows, emails };
  } catch {
    return { state: "not_provisioned" };
  }
}

export async function RolesPanel() {
  const result = await loadRoleRows();
  const { t } = getServerDict();

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">
          {t.audit.rolesTitle}
        </h2>
        <p className="max-w-2xl font-body text-[13px] text-ink-soft">
          {t.audit.rolesSubtitleA}
          <span className="font-mono text-[12px]">lib/auth/roles.ts</span>{t.audit.rolesSubtitleB}
        </p>
      </div>

      {result.state === "not_provisioned" ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-12 text-center">
          <Badge tone="amber">{t.audit.rolesNotProvisioned}</Badge>
          <p className="max-w-md font-body text-[13px] leading-relaxed text-ink-soft">
            {t.audit.rolesNotProvisionedA}<code className="font-mono">crm_user_role</code>{t.audit.rolesNotProvisionedB}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-glass-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-bold">{t.audit.thUser}</th>
                <th className="px-4 py-3 font-bold">{t.audit.thRole}</th>
                <th className="px-4 py-3 font-bold">{t.audit.thGranted}</th>
              </tr>
            </thead>
            <tbody className="font-body text-[14px] text-ink">
              {result.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-ink-soft">
                    {t.audit.rolesEmpty}
                  </td>
                </tr>
              ) : (
                result.rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-glass-border last:border-0">
                    <td className="px-4 py-3 font-mono text-[13px]">
                      {result.emails[r.user_id] ?? r.user_id}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{r.role}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {r.granted_at ? r.granted_at.slice(0, 10) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
