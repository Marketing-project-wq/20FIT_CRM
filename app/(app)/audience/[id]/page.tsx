import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { ProfileDetail } from "@/components/audience/profile-detail";

export const metadata: Metadata = { title: "Profil" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Profile detail. Fails closed on profile.view_list at the page (same as the list);
 * the /api/audience/[id] handler re-checks server-side, masks, and writes the
 * profile.viewed audit row. Reached by clicking a row in /audience.
 */
export default async function ProfileDetailPage({ params }: { params: { id: string } }) {
  const role = await getCurrentUserRole();

  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Profil</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed)."
              : "Peran Anda tidak memiliki izin untuk melihat profil."}
          </p>
        </div>
      </div>
    );
  }

  return <ProfileDetail id={params.id} />;
}
