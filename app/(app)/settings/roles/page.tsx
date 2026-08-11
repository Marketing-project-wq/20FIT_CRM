import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Roles" };

type RoleRow = { user_id: string; role: string; granted_at: string | null };

type LoadResult =
  | { state: "ready"; rows: RoleRow[]; emails: Record<string, string> }
  | { state: "not_provisioned" };

/**
 * Read crm_user_role via the service-role client (RLS ON, zero policy -> only the
 * admin client can read it). Best-effort email resolution. A missing table (migration
 * not run) or any error surfaces as "not_provisioned" rather than a crash.
 */
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

function Heading() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Roles</h1>
      <p className="max-w-2xl font-body text-[14px] text-ink-soft">
        RBAC — read-only. Perubahan peran ditunda sampai audit log berjalan: mengubah
        izin tanpa jejak audit adalah hal yang justru ingin kita hindari sejak awal.
      </p>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
      {children}
    </div>
  );
}

export default async function RolesPage() {
  const role = await getCurrentUserRole();

  // Fail closed: only a role that may view the audit log (super_admin, crm_manager)
  // may see the RBAC list — role management lives on the same governance surface.
  if (!isPermitted(role, "audit.view")) {
    return (
      <div>
        <Heading />
        <Panel>
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            Halaman ini butuh peran dengan izin melihat RBAC. Bila RBAC belum
            di-provision (migrasi <code className="font-mono">crm_user_role</code> belum
            dijalankan atau super_admin belum di-seed), semua akses ditolak — ini
            perilaku fail-closed yang benar, bukan kesalahan.
          </p>
        </Panel>
      </div>
    );
  }

  const result = await loadRoleRows();

  if (result.state === "not_provisioned") {
    return (
      <div>
        <Heading />
        <Panel>
          <Badge tone="amber">RBAC belum di-provision</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            Tabel <code className="font-mono">crm_user_role</code> belum ada. Jalankan
            migrasi Sprint 2 lalu seed super_admin pertama; daftar peran akan muncul di
            sini.
          </p>
        </Panel>
      </div>
    );
  }

  const { rows, emails } = result;

  return (
    <div>
      <Heading />

      <div className="mt-8 overflow-x-auto rounded-card border border-glass-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-bold">Pengguna</th>
              <th className="px-4 py-3 font-bold">Peran</th>
              <th className="px-4 py-3 font-bold">Diberikan</th>
            </tr>
          </thead>
          <tbody className="font-body text-[14px] text-ink">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-ink-soft">
                  Belum ada peran yang di-assign.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.user_id} className="border-b border-glass-border last:border-0">
                  <td className="px-4 py-3 font-mono text-[13px]">{emails[r.user_id] ?? r.user_id}</td>
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

      <p className="mt-4 font-mono text-[11px] text-ink-faint">
        Read-only. Matriks izin: lib/auth/roles.ts (PRD 17.2, disetujui Jeff 2026-08-10).
      </p>
    </div>
  );
}
