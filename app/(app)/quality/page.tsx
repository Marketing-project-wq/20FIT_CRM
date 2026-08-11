import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { QualityDashboard } from "@/components/quality/quality-dashboard";

export const metadata: Metadata = { title: "Quality" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Data-quality dashboard. All the work (aggregates, audit) happens in the
 * /api/quality route handler, which re-checks the role server-side on every request.
 * This page renders the shell and fails closed on the SAME action the API gates on,
 * so a role without list access sees a clear denial instead of an empty dashboard.
 */
export default async function QualityPage() {
  const role = await getCurrentUserRole();

  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          Quality
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed) sampai tabel itu dibangun."
              : "Peran Anda tidak memiliki izin untuk melihat kualitas data profil. Bila RBAC belum di-provision, semua akses ditolak — ini perilaku fail-closed yang benar."}
          </p>
        </div>
      </div>
    );
  }

  return <QualityDashboard />;
}
