import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, isPermitted, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { AudiencePool } from "@/components/audience/audience-pool";
import { SuppressionPanel } from "@/components/consent/suppression-panel";
import { QualityDashboard } from "@/components/quality/quality-dashboard";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Audience" };

// Role-dependent + audited on every load — never statically cached.
export const dynamic = "force-dynamic";

type AudienceTab = "list" | "unsubscribe" | "quality";

/**
 * Audience — the pool, its unsubscribe (crm_suppression) list, and its data-quality dashboard, now
 * ONE screen with three tabs (nav rebuild 11→7). Quality moved here (not the dashboard) — the quality
 * numbers describe THIS pool, so they sit beside it. Unsubscribe moved from the old /consent screen.
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

  const canUnsub = isPermitted(role, "consent.edit");
  const tabs: TabDef[] = [
    { key: "list", label: t.tabs.audienceList, href: "/audience?tab=list" },
    ...(canUnsub ? [{ key: "unsubscribe", label: t.tabs.audienceUnsubscribe, href: "/audience?tab=unsubscribe" }] : []),
    { key: "quality", label: t.tabs.audienceQuality, href: "/audience?tab=quality" },
  ];

  // Resolve the requested tab, falling back to List for anything unknown or not permitted.
  const requested = (searchParams?.tab ?? "list") as AudienceTab;
  const active: AudienceTab = tabs.some((tab) => tab.key === requested) ? requested : "list";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.audience}</h1>
      <TabBar tabs={tabs} active={active} />

      {active === "list" && (
        <>
          <CoverageNotice screen="search" />
          <AudiencePool />
        </>
      )}
      {active === "unsubscribe" && (
        <>
          <CoverageNotice screen="consent" />
          <SuppressionPanel />
        </>
      )}
      {active === "quality" && (
        <>
          <CoverageNotice screen="quality" />
          <QualityDashboard />
        </>
      )}
    </div>
  );
}
