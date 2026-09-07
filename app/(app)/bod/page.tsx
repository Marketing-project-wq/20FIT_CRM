import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchReach, fetchLoadHistory, fetchDeliveryHealth } from "@/lib/crm/bod";
import { fetchNotInCrm } from "@/lib/crm/dashboard-sources";
import { fetchMirrorDashboardStats } from "@/lib/crm/mirror";
import { BodContent, type BodData } from "@/components/dashboard/bod-content";

export const metadata: Metadata = { title: "Ringkasan Direksi" };
export const dynamic = "force-dynamic";

/**
 * BOD screen — five cards, one page, one timestamp.
 *
 * SERVER-RENDERED ON PURPOSE, and that is the design, not a shortcut. The operational dashboard
 * loads in five independent blocks so the cheap figures paint first; here that would be wrong. A
 * board screen must not show four fresh numbers beside one that arrived at a different moment —
 * the reader has no way to tell which is which, and the whole page is read as one statement. So
 * everything is fetched together, and the page carries a single "measured at" stamp.
 *
 * ONE DEVIATION, STATED RATHER THAN HIDDEN: card 3 (business units) reads the daily precompute
 * (crm_mirror_meta.dashboard_stats), not a live count, and therefore carries its own refresh time
 * ON THE CARD. It cannot be counted live: customer_engagement is unique on
 * (customer_id, unit, product, COALESCE(period,'__NULL__')), so one person may hold several rows in
 * one unit and a row count is NOT a headcount. Today membership happens to be 1:1 (67,828/67,828)
 * while event (19,333/18,247) and clinic (1,163/1,014) are not — relying on that would be taking a
 * snapshot for a permanent property, which is T-50 exactly.
 *
 * THE INTENDED END STATE IS THE OPPOSITE OF THIS EXCEPTION (K-61): the WHOLE page becomes a daily
 * snapshot with one timestamp, and the per-unit RPC is cancelled outright — not parked. Timestamp
 * consistency is the feature, not an oversight someone should later "fix" by making cards live.
 *
 * That is not done yet, and the reason is measured, not assumed (T-59): the daily snapshot is
 * written by the SQL function public.crm_refresh_customer_mirror() (cron `0 20 * * *`), and its
 * blob carries only engagement/rfm/fitco/ecosystem/candidates/sources. Four of the five cards have
 * no daily source at all, so giving them one means changing that function — a gated migration.
 * Until that gate opens the page stays as it is. Labelling the whole page "as of 03:00" while four
 * cards were counted seconds ago would be one sentence that is precisely false about the data
 * beneath it — the same failure K-60 exists to end, committed on purpose. So it is not done.
 *
 * NO INTERNAL VOCABULARY on this screen: no "pool", "mirror", "RFM", "ingest", "frozen". Those
 * words describe how this system is built, and the board is not reading about the plumbing.
 */

async function loadBod(): Promise<BodData> {
  const admin = createAdminClient();
  const [reach, history, health, notInCrm, mirror] = await Promise.all([
    fetchReach(admin),
    fetchLoadHistory(admin),
    fetchDeliveryHealth(admin),
    fetchNotInCrm(admin),
    fetchMirrorDashboardStats(admin),
  ]);

  // `shop` has no precompute column (it is tiny), so it is counted live alongside the blob's five.
  const shop = await admin
    .from("customer_engagement")
    .select("customer_id", { count: "exact", head: true })
    .eq("unit", "shop");

  const units = Object.entries(mirror.engagement)
    .map(([unit, people]) => ({ unit, people: Number(people) || 0 }))
    .concat(shop.error ? [] : [{ unit: "shop", people: shop.count ?? 0 }])
    .sort((a, b) => b.people - a.people);

  return {
    measuredAt: new Date().toISOString(),
    reach,
    loads: history.loads,
    loadsTruncated: history.truncated,
    units,
    unitsRefreshedAt: mirror.refreshedAt,
    health,
    notInCrmDistinct: notInCrm.distinctPeople,
    notInCrmPerSourceSum: notInCrm.perSourceSum,
  };
}

export default async function BodPage() {
  const role = await getCurrentUserRole();
  const { t, lang } = getServerDict();

  if (!canViewProfileList(role)) {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.bod.title}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{t.access.dashboardHidden}</p>
        </div>
      </div>
    );
  }

  const data = await loadBod();
  return <BodContent data={data} t={t} lang={lang} />;
}
