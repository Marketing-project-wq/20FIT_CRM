/**
 * Pure display rule for a run's background-drain state in the Deliveries tab (P0-3). Kept OUT of
 * deliveries.ts (server-only, holding the Supabase I/O) so the rule — which runs read as
 * running/paused and which offer Resume/Stop — is unit-testable. A wrong `resumable` flag would put a
 * "Lanjutkan" button on a finished run and re-send to people, so this is locked by a test.
 */

/**
 * A drain-active run that has made NO progress for this many minutes is treated as STALLED — the
 * executor is not draining it (a deploy killed a tick, cron is down, a batch hung). At a 5-minute cron
 * cadence with a ~3-minute batch, this is ~4 missed ticks: a real hole, not a hiccup. A healthy
 * draining run writes a log row (sent OR skipped) every tick, so its "minutes since progress" stays
 * small; a stalled one climbs past this. Deliberately GENEROUS so a transient miss never cries wolf.
 */
export const STALL_MINUTES = 20;

export interface RunDrainDisplay {
  /** For a 'sending' CAMPAIGN run, the state to show: 'running' while actively draining, 'paused' once
   *  today's daily budget is spent (leftover waits for a human "Lanjutkan"), 'stalled' when it is
   *  drain-active but the executor has made no progress for STALL_MINUTES (a dead/stuck executor — the
   *  ZOMBIE case: without this, a run whose executor died reads 'running' forever). null for every
   *  other run (draft/sent/partial/failed/stopped, and any workflow run) → the caller uses its normal
   *  status map. */
  sendingState: "running" | "paused" | "stalled" | null;
  /** A paused campaign run can be resumed (re-arm the drain). */
  resumable: boolean;
  /** Any 'sending' campaign run — draining, paused OR stalled — can be stopped. */
  stoppable: boolean;
}

/**
 * @param status               crm_campaign_run.status
 * @param drainActive          crm_campaign_run.drain_active
 * @param isCampaign           true when the run is owned by a segment (a manual campaign), false for a
 *                             workflow run — workflow runs never use the drainer, so their 'sending'
 *                             stays plain running and offers no drain controls.
 * @param minutesSinceProgress minutes since this run's last log activity (max sent/skip row, else the
 *                             run's creation) — ONLY for a drain-active campaign run; null otherwise.
 *                             When it exceeds STALL_MINUTES the run reads 'stalled', not 'running', so a
 *                             dead executor is visible on screen instead of a zombie that looks alive.
 */
export function runDrainDisplay(
  status: string,
  drainActive: boolean,
  isCampaign: boolean,
  minutesSinceProgress: number | null = null,
): RunDrainDisplay {
  const sendingCampaign = status === "sending" && isCampaign;
  let sendingState: RunDrainDisplay["sendingState"] = null;
  if (sendingCampaign) {
    if (!drainActive) sendingState = "paused";
    else if (minutesSinceProgress != null && minutesSinceProgress > STALL_MINUTES) sendingState = "stalled";
    else sendingState = "running";
  }
  return {
    sendingState,
    resumable: sendingCampaign && !drainActive,
    stoppable: sendingCampaign,
  };
}
