import type { Metadata } from "next";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBodSnapshot, type BodSnapshot } from "@/lib/crm/bod";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * ONE Dashboard, TWO layers (K-61, revised 7 Sep 2026):
 *
 *   TOP    — Ringkasan Direksi. Five cards from ONE daily snapshot, with that snapshot's own
 *            `refreshed_at` as its single timestamp (K-63) and a staleness banner past 26h.
 *   BOTTOM — Detail operasional. The existing blocks, several of them counted at request time,
 *            under their own heading and their own freshness statement.
 *
 * The summary is fetched HERE, server-side, because it is one row and must not be one of the
 * client's progressive blocks: a summary that painted in pieces would be five freshnesses again.
 * The operational layer keeps its per-block loading, which is right for it — those blocks differ in
 * cost by two orders of magnitude.
 *
 * WHY NOT A SEPARATE /bod PAGE, which is what this was for a few hours: a second screen reading the
 * same data would drift from the first on its own, and the owner's instruction was to improve the
 * Dashboard rather than add a page beside it. /bod now redirects here, so shared links stay alive.
 *
 * A NULL summary is not an error state to hide: it means the daily snapshot could not be read, and
 * DashboardContent says so in place of the section rather than silently rendering only the
 * operational half — a missing top layer that left no trace would be indistinguishable from a
 * Dashboard that never had one.
 */
export default async function DashboardPage() {
  const role = await getCurrentUserRole();
  let summary: BodSnapshot | null = null;

  if (canViewProfileList(role)) {
    try {
      summary = await fetchBodSnapshot(createAdminClient());
    } catch {
      // parseBodSnapshot throws on a missing key — including on a blob written by the pre-migration
      // six-key function, which is exactly what a rollback leaves behind. Throwing is deliberate:
      // zeros on a board-facing summary would read as measurements.
      summary = null;
    }
  }

  return <DashboardContent summary={summary} nowMs={Date.now()} />;
}
