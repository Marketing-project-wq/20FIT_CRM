import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, isPermitted, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { ProfileDetail } from "@/components/audience/profile-detail";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Profile" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Profile detail. Fails closed on profile.view_list at the page (same as the list);
 * the /api/audience/[id] handler re-checks server-side, masks, and writes the
 * profile.viewed audit row. Reached by clicking a row in /audience.
 */
export default async function ProfileDetailPage({ params }: { params: { id: string } }) {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.profile.pageTitle}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope" ? t.access.segmentsDeniedScope : t.access.profileDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  // Whether this role may record a suppression from the profile. The API re-checks
  // consent.edit server-side; this only decides whether to render the entry point.
  const canEditConsent = isPermitted(role, "consent.edit");
  // Whether this role may fill EMPTY demographic fields (profile.edit_demographic, K-32 extension).
  // The API re-checks server-side; this only decides whether to render the fill form.
  const canEditDemographic = isPermitted(role, "profile.edit_demographic");

  return (
    <>
      <CoverageNotice screen="profile" />
      <ProfileDetail id={params.id} canEditConsent={canEditConsent} canEditDemographic={canEditDemographic} />
    </>
  );
}
