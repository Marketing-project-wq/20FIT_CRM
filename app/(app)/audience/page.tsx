import type { Metadata } from "next";
import { AudienceActions } from "@/components/audience/audience-actions";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, canImportAudience, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { AudiencePool } from "@/components/audience/audience-pool";
import { QualityDashboard } from "@/components/quality/quality-dashboard";
import { ActivityCoveragePanel } from "@/components/quality/activity-coverage-panel";
import { EmailTypoFixPanel } from "@/components/quality/email-typo-fix-panel";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Audience" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

type AudienceTab = "list" | "quality";

/**
 * Audience — the pool and its data-quality dashboard, ONE screen with two tabs (nav rebuild 11→7).
 * Quality moved here (not the dashboard) — the quality numbers describe THIS pool, so they sit beside it.
 * The Unsubscribe tab was removed (owner request 2026-10-14): the crm_suppression list itself still
 * applies to every send and /unsubscribe still records opt-outs — only the screen is gone.
 * Each tab keeps its own gate + coverage marker + the API-side re-check it always had.
 */
export default async function AudiencePage({ searchParams }: { searchParams?: { tab?: string } }) {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.audience}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-surface-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope" ? t.access.audienceDeniedScope : t.access.audienceDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  const tabs: TabDef[] = [
    { key: "list", label: t.tabs.audienceList, href: "/audience?tab=list" },
    { key: "quality", label: t.tabs.audienceQuality, href: "/audience?tab=quality" },
  ];

  // Resolve the requested tab, falling back to List for anything unknown or not permitted.
  const requested = (searchParams?.tab ?? "list") as AudienceTab;
  const active: AudienceTab = tabs.some((tab) => tab.key === requested) ? requested : "list";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.audience}</h1>
        {canImportAudience(role) && <AudienceActions />}
      </div>
      <TabBar tabs={tabs} active={active} />

      {active === "list" && (
        <>
          <CoverageNotice screen="search" />
          <AudiencePool />
        </>
      )}
      {active === "quality" && (
        <>
          <CoverageNotice screen="quality" />
          {canImportAudience(role) && <EmailTypoFixPanel />}
          <ActivityCoveragePanel />
          <QualityDashboard />
        </>
      )}
    </div>
  );
}
