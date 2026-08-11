import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { ConsentRegister } from "@/components/consent/consent-register";

export const metadata: Metadata = { title: "Consent" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Consent register (read-only). Gated on consent.edit — the SAME action
 * canSeeNav("/consent") resolves to (super_admin, crm_manager, data_steward) — even
 * though the screen is read-only this sprint. Fail-closed; the /api/consent handler
 * re-checks server-side, masks identity keys, and audits the read.
 */
export default async function ConsentPage() {
  const role = await getCurrentUserRole();

  if (!isPermitted(role, "consent.edit")) {
    const decision = resolveGrant(role, "consent.edit");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Consent</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? "Peran unit_manager dibatasi pada unit yang dikelola, tetapi tabel unit-scope belum ada — akses ditolak (fail-closed)."
              : "Register consent hanya untuk super_admin, crm_manager, dan data_steward. Bila RBAC belum di-provision, semua akses ditolak — ini perilaku fail-closed yang benar."}
          </p>
        </div>
      </div>
    );
  }

  return <ConsentRegister />;
}
