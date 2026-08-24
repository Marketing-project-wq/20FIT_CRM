import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { AudiencePool } from "@/components/audience/audience-pool";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Audience" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Audience pool. The heavy lifting (data, masking, audit) is in the /api/audience
 * route handler, which re-checks the role server-side on every request. This page
 * only renders the shell and fails closed on profile.view_list so a role with no
 * list access sees a clear denial instead of an empty table.
 */
export default async function AudiencePage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          {t.nav.audience}
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope" ? t.access.audienceDeniedScope : t.access.audienceDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CoverageNotice screen="search" />
      <AudiencePool />
    </>
  );
}
