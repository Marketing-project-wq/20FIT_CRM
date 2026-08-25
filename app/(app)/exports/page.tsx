import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant, grantFor } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { loadCityFill } from "@/lib/crm/city-fill";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Exports" };
export const dynamic = "force-dynamic";

/**
 * Exports — compose criteria and export CSV. After the nav rebuild removed /segments, the criteria
 * builder (with the AI assistant) lives here AND in Campaigns via the SAME shared SegmentBuilder
 * component (one file, two mount points). canExport=true here (the export button is the point);
 * Campaigns mounts the same builder with canExport=false. The export route re-checks the real grant
 * against the row count and excludes suppression (4A) — this page only decides who may reach it.
 */
export default async function ExportsPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  // Reaching this screen needs the builder (segment.build). Export-permission for the button is a
  // separate grant, passed to the builder as canExport.
  if (!isPermitted(role, "segment.build")) {
    const decision = resolveGrant(role, "segment.build");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.exports}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope" ? t.access.segmentsDeniedScope : t.access.segmentsDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  const canViewHealth = isPermitted(role, "profile.view_health");
  const canExport = grantFor(role, "export.at_or_below_threshold") !== "deny";
  const cityFill = await loadCityFill();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.exports}</h1>
      <CoverageNotice screen="segments" />
      <SegmentBuilder
        cityFillPct={cityFill.cityFillPct}
        cityFilled={cityFill.cityFilled}
        total={cityFill.total}
        canViewHealth={canViewHealth}
        canExport={canExport}
      />
    </div>
  );
}
