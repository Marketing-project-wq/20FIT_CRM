import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserEmails } from "@/lib/auth/user-directory";
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
    // Resolve each member's email by ITS id (getUserById), not a page-1 listUsers() dump — the shared
    // 935-account pool put members past page 1 and made the table show UUIDs (T-33).
    const emails = await resolveUserEmails(rows.map((r) => r.user_id));
    return { state: "ready", rows, emails };
  } catch {
    return { state: "not_provisioned" };
  }
}

/** Show the member's email. If it truly can't be resolved, SAY SO (a tagged uuid) rather than passing
 *  the uuid off as the answer (LARANGAN / T-33). */
function Identity({ email, userId, unresolvedLabel }: { email?: string; userId: string; unresolvedLabel: string }) {
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
      ) : result.rows.length === 0 ? (
        <div className="rounded-card border border-glass-border px-4 py-10 text-center font-body text-[14px] text-ink-soft">
          {t.audit.rolesEmpty}
        </div>
      ) : (
        <>
          {/* Wide: table. Identity shown as EMAIL, resolved by getUserById for THIS member only (never a
              directory dump). If it truly can't resolve, the cell says so — it does not pass a uuid off
              as the answer (T-33). */}
          <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3 font-bold">{t.audit.thUser}</th>
                  <th className="px-4 py-3 font-bold">{t.audit.thRole}</th>
                  <th className="px-4 py-3 font-bold">{t.audit.thGranted}</th>
                </tr>
              </thead>
              <tbody className="font-body text-[14px] text-ink">
                {result.rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-glass-border last:border-0">
                    <td className="px-4 py-3 font-mono text-[13px]">
                      <Identity email={result.emails[r.user_id]} userId={r.user_id} unresolvedLabel={t.audit.emailUnresolved} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{r.role}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {r.granted_at ? r.granted_at.slice(0, 10) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Narrow: per-row cards (BAGIAN D responsive pattern). */}
          <div className="flex flex-col gap-2 md:hidden">
            {result.rows.map((r) => (
              <div key={r.user_id} className="rounded-card border border-glass-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all font-mono text-[13px] text-ink">
                    <Identity email={result.emails[r.user_id]} userId={r.user_id} unresolvedLabel={t.audit.emailUnresolved} />
                  </span>
                  <Badge tone="neutral">{r.role}</Badge>
                </div>
                <p className="mt-1 font-mono text-[12px] text-ink-faint">
                  {t.audit.thGranted}: {r.granted_at ? r.granted_at.slice(0, 10) : "—"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
