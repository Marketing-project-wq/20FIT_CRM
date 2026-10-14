import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, isPermitted } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventAnalyticsCached } from "@/lib/crm/cached-loaders";
import { EventAnalysis } from "@/components/analytics/event-analysis";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Event Analysis" };
export const dynamic = "force-dynamic";

export default async function EventAnalyticsPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!canViewProfileList(role)) {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          {t.nav.eventAnalysis}
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-surface-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {t.access.audienceDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  // Pages through all of master_customer (~30 s) — a shared aggregate, cached 10 min and refreshed in
  // the background (registry/tag/import writes drop it). See lib/crm/server-cache.ts.
  const data = await eventAnalyticsCached(admin);

  const allGroups = data.groups.map((g) => ({
    key: g.groupKey,
    label: g.groupLabel,
  }));

  // Managing the event registry is the "admin" gate — same permission as tag management.
  const canManage = isPermitted(role, "audit.view");

  return <EventAnalysis data={data} nowMs={Date.now()} allGroups={allGroups} canManage={canManage} />;
}
