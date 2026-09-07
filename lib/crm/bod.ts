import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for the BOD screen. EVERY figure comes from ONE daily snapshot —
 * `crm_mirror_meta.dashboard_stats`, written by public.crm_refresh_customer_mirror() on the
 * `0 20 * * *` cron (03:00 WIB) — and the page's single timestamp is that row's `refreshed_at`.
 *
 * WHY THE TIMESTAMP MUST COME FROM THE BLOB, NEVER FROM `now()` (K-63). This function now reads a
 * dozen tables owned by other divisions (arena_*, gym_*, clinic_patients, my20fit_profile,
 * cf_hyrox_participants). If one of those teams renames a column, that night's refresh throws and
 * the blob simply keeps yesterday's contents. Stamp the page with `now()` and the failure becomes
 * invisible: yesterday's numbers under today's date, indefinitely, with nothing to notice. Stamp it
 * with `refreshed_at` and the timestamp stops moving — which IS the alarm. A page that fails loudly
 * beats a page that lies quietly, and the staleness banner below turns the stopped clock into a
 * sentence rather than something the reader has to spot.
 *
 * The whole page is therefore a snapshot, deliberately (K-61). Nothing here is counted at request
 * time; adding one live figure would silently reintroduce the two-freshness problem this replaced.
 */

/** How old the snapshot may get before the page says so. 26h, not 24h: the cron runs daily, so a
 *  24h threshold would flag a normal run that started a few minutes late. 26h is comfortably past
 *  one cycle and comfortably short of two — one missed night is visible the next morning. */
export const BOD_STALE_AFTER_HOURS = 26;

export interface Reach {
  emailable: number;
  whatsappable: number;
  poolTotal: number;
  everContacted: number;
}

export interface Load {
  at: string;
  count: number;
}

export interface DeliveryHealth {
  delivered: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
  workflowQueued: number;
}

export interface BodSnapshot {
  /** The blob's own `refreshed_at`. NEVER `now()` — see the module note. Null only if the row has
   *  never been written, which the page renders as an em dash rather than a plausible date. */
  measuredAt: string | null;
  reach: Reach;
  loads: Load[];
  units: { unit: string; people: number }[];
  health: DeliveryHealth;
  notInCrmDistinct: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0;
}

/**
 * Is this snapshot older than the threshold? Pure, so the page's warning is testable without a
 * clock. `null` (never refreshed) counts as stale — the alternative is treating "we have never
 * computed this" as fresh, which is the most confident possible way to be wrong.
 */
export function isBodSnapshotStale(measuredAt: string | null, now: number): boolean {
  if (measuredAt === null) return true;
  const t = Date.parse(measuredAt);
  if (Number.isNaN(t)) return true;
  return now - t > BOD_STALE_AFTER_HOURS * 3600_000;
}

/** How many whole hours old the snapshot is, for the warning text. Null when unknown. */
export function bodSnapshotAgeHours(measuredAt: string | null, now: number): number | null {
  if (measuredAt === null) return null;
  const t = Date.parse(measuredAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 3600_000));
}

/**
 * Turn one `crm_mirror_meta` row into the screen's shape. PURE — this is what the tests pin, and
 * in particular it is where "the timestamp is the blob's, not the clock's" is enforced: this
 * function has no access to a clock at all, so it could not use `now()` even by accident.
 *
 * FAIL-HARD on a missing key, matching fetchMirrorDashboardStats: a blob written by the OLD
 * six-key function (before migration `crm_mirror_bod_daily_stats`, or after a rollback to
 * docs/riwayat/ROLLBACK-crm_refresh_customer_mirror-20260907.sql) has no `reach`, and rendering
 * zeros for it would put "0 reachable" on a board screen. An error shows the page's failure state
 * instead, which is recoverable; a confident zero is not.
 */
export function parseBodSnapshot(
  blob: Record<string, unknown> | null,
  refreshedAt: string | null,
): BodSnapshot {
  if (!blob || typeof blob !== "object") {
    throw new Error("crm_mirror_meta.dashboard_stats absent — the daily snapshot has never been written");
  }
  for (const key of ["reach", "loads", "delivery", "not_in_crm", "engagement"]) {
    if (blob[key] == null) {
      throw new Error(
        `crm_mirror_meta.dashboard_stats.${key} absent — refusing to render zeros for a missing snapshot key ` +
          "(a blob from the pre-migration six-key function looks exactly like this)",
      );
    }
  }

  const reachRaw = blob.reach as Record<string, unknown>;
  const deliveryRaw = blob.delivery as Record<string, unknown>;
  const notInCrmRaw = blob.not_in_crm as Record<string, unknown>;
  const engagementRaw = blob.engagement as Record<string, unknown>;
  const loadsRaw = Array.isArray(blob.loads) ? (blob.loads as Record<string, unknown>[]) : [];

  return {
    measuredAt: refreshedAt,
    reach: {
      emailable: num(reachRaw.emailable),
      whatsappable: num(reachRaw.whatsappable),
      poolTotal: num(reachRaw.pool_total),
      everContacted: num(reachRaw.ever_contacted),
    },
    loads: loadsRaw
      .map((l) => ({ at: String(l.at ?? ""), count: num(l.count) }))
      .filter((l) => l.at !== ""),
    // The five units the snapshot carries. `shop` is NOT among them — see the note in
    // components/dashboard/bod-content.tsx for why it is named on the card rather than counted
    // live, and lib/crm/mirror.ts for the precompute's own statement that shop is absent.
    units: Object.entries(engagementRaw)
      .map(([unit, people]) => ({ unit, people: num(people) }))
      .sort((a, b) => b.people - a.people),
    health: {
      delivered: num(deliveryRaw.delivered),
      bounced: num(deliveryRaw.bounced),
      failed: num(deliveryRaw.failed),
      unsubscribed: num(deliveryRaw.unsubscribed),
      workflowQueued: num(deliveryRaw.workflow_queued),
    },
    notInCrmDistinct: num(notInCrmRaw.distinct_people),
  };
}

/** Read the one snapshot row. ONE query — the whole page comes from it. */
export async function fetchBodSnapshot(admin: SupabaseClient): Promise<BodSnapshot> {
  const { data, error } = await admin
    .from("crm_mirror_meta")
    .select("dashboard_stats, refreshed_at")
    .maybeSingle();
  if (error) throw error;
  const row = data as { dashboard_stats: Record<string, unknown> | null; refreshed_at: string | null } | null;
  return parseBodSnapshot(row?.dashboard_stats ?? null, row?.refreshed_at ?? null);
}
