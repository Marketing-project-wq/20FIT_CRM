import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant, grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { SegmentBuilder } from "@/components/segments/segment-builder";

export const metadata: Metadata = { title: "Segments" };
export const dynamic = "force-dynamic";

/**
 * Segment builder. Gate: segment.build (super_admin, crm_manager, crm_operator, analyst;
 * unit_manager own_unit -> needs_scope -> DENY; data_steward denied). Fail-closed.
 *
 * The city-fill % is computed LIVE here (parameter-free aggregates, not audited per K-07,
 * and not hardcoded per K-10) and passed to the client so the "kota 93% kosong" warning
 * carries a real, current number.
 */
export default async function SegmentsPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();
  if (!isPermitted(role, "segment.build")) {
    const decision = resolveGrant(role, "segment.build");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.segments}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope" ? t.access.segmentsDeniedScope : t.access.segmentsDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  let total = 0;
  let cityFilled = 0;
  try {
    const [totalRes, cityRes] = await Promise.all([
      admin.from("master_customer").select("customer_id", { count: "exact", head: true }),
      admin.from("master_customer").select("customer_id", { count: "exact", head: true }).not("city", "is", null),
    ]);
    total = totalRes.count ?? 0;
    cityFilled = cityRes.count ?? 0;
  } catch {
    // Non-fatal: the builder still works; the warning just shows 0%.
    total = 0;
    cityFilled = 0;
  }
  const cityFillPct = total > 0 ? (cityFilled / total) * 100 : 0;
  const canViewHealth = isPermitted(role, "profile.view_health");
  // Export button is shown to roles that may export OR request one (allow / approval); hidden on
  // a flat deny (analyst, data_steward). The route re-checks the real grant against the row count.
  const canExport = grantFor(role, "export.at_or_below_threshold") !== "deny";

  return (
    <SegmentBuilder
      cityFillPct={cityFillPct}
      cityFilled={cityFilled}
      total={total}
      canViewHealth={canViewHealth}
      canExport={canExport}
    />
  );
}
