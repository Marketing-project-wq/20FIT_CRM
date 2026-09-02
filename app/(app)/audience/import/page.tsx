import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canImportAudience } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { ImportWizard } from "@/components/audience/import-wizard";

export const metadata: Metadata = { title: "Impor Audiens" };

// Role-dependent + writes on submit — never statically cached.
export const dynamic = "force-dynamic";

/**
 * CSV audience import (Fase 1). SUPER-ADMIN ONLY (canImportAudience) — fail-closed, a denial not an
 * empty page. The wizard itself never writes; the server route re-checks the permission and the
 * dry-run writes nothing (only "Konfirmasi & impor" commits). i18n: this new screen ships hardcoded
 * Indonesian for Fase 1 (operators are Indonesian); it is deliberately NOT in BILINGUAL_SCREENS yet —
 * translating it is separate follow-up work (noted in the PR).
 */
export default async function AudienceImportPage() {
  const role = await getCurrentUserRole();

  if (!canImportAudience(role)) {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Impor Audiens</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            Impor audiens hanya untuk Super Admin. Fitur ini menambah orang baru ke pool dan menandainya bisa dihubungi,
            jadi dibatasi ke peran dengan wewenang tertinggi.
          </p>
        </div>
      </div>
    );
  }

  return <ImportWizard />;
}
