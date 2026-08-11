import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { RolesPanel } from "@/components/settings/roles-panel";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";

export const metadata: Metadata = { title: "Settings" };

// Role-dependent — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Settings hub. One coherent page for the two governance surfaces that already exist
 * — RBAC roles and the audit log — instead of a stub that doesn't know about
 * /settings/roles. Both are gated on the SAME action, audit.view (super_admin,
 * crm_manager), which is exactly what canSeeNav("/settings") resolves to. Fail-closed:
 * a role without it sees a denial, not an empty page.
 */
export default async function SettingsPage() {
  const role = await getCurrentUserRole();

  if (!isPermitted(role, "audit.view")) {
    const decision = resolveGrant(role, "audit.view");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          Settings
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed)."
              : "Pengaturan (peran & audit log) hanya untuk super_admin dan crm_manager. Bila RBAC belum di-provision, semua akses ditolak — ini perilaku fail-closed yang benar."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          Settings
        </h1>
        <p className="mt-2 font-body text-[14px] text-ink-soft">
          Tata kelola: peran RBAC dan jejak audit. Keduanya read-only di sprint ini.
        </p>
      </header>

      <AuditLogPanel />
      <RolesPanel />
    </div>
  );
}
