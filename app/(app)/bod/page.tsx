import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBodSnapshot } from "@/lib/crm/bod";
import { BodContent } from "@/components/dashboard/bod-content";

export const metadata: Metadata = { title: "Ringkasan Direksi" };
export const dynamic = "force-dynamic";

/**
 * BOD screen — five cards, one page, ONE timestamp, and that timestamp is the snapshot's own
 * `refreshed_at` (K-63). The page reads exactly one row: crm_mirror_meta. Nothing is counted at
 * request time.
 *
 * WHY NOT LIVE, AND WHY NOT `now()`. A board screen is read as one statement, so it needs one
 * freshness line — that was K-61, and it is why the per-unit COUNT(DISTINCT) RPC was cancelled
 * outright rather than parked. The remaining question was which clock the line should show, and
 * the answer is not the obvious one: the nightly function now reads a dozen tables owned by other
 * divisions, and if one of them renames a column the refresh throws and the blob keeps yesterday's
 * numbers. Under `now()` that failure is invisible — old figures, today's date, forever. Under
 * `refreshed_at` the clock simply stops, and a stopped clock on a dated page is an alarm. The
 * staleness banner (>26h) states it in words so nobody has to notice a date.
 *
 * ONE COST, NAMED ON THE CARD RATHER THAN HIDDEN: the snapshot carries five ecosystem units;
 * `shop` is not among them (lib/crm/mirror.ts has always said so — it was counted live before).
 * Counting it live here would hand the page a second freshness, which is the whole thing this
 * design refuses. So shop is excluded and the card says it is, with its size, instead of quietly
 * shrinking a total. Adding it to the snapshot is a one-line change to the nightly function and
 * belongs to a future gated migration.
 *
 * NO INTERNAL VOCABULARY on this screen: no "pool", "mirror", "RFM", "ingest", "frozen". Those
 * words describe how this system is built, and the board is not reading about the plumbing.
 */
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

  // parseBodSnapshot throws when a key is missing — including on a blob written by the old
  // six-key function, which is exactly what a rollback would leave behind. Showing the failure is
  // the point: zeros on a board screen would read as measurements.
  let data;
  try {
    data = await fetchBodSnapshot(createAdminClient());
  } catch {
    return (
      <div>
        <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{t.bod.title}</h1>
        <div className="tint-red mt-6 rounded-card p-5">
          <p className="font-body text-[14px] leading-relaxed text-ink">{t.bod.snapshotMissing}</p>
        </div>
      </div>
    );
  }

  return <BodContent data={data} t={t} lang={lang} nowMs={Date.now()} />;
}
