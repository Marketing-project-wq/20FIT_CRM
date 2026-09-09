/**
 * Pure display rule for a run's background-drain state in the Deliveries tab (P0-3). Kept OUT of
 * deliveries.ts (server-only, holding the Supabase I/O) so the rule — which runs read as
 * running/paused and which offer Resume/Stop — is unit-testable. A wrong `resumable` flag would put a
 * "Lanjutkan" button on a finished run and re-send to people, so this is locked by a test.
 */

export interface RunDrainDisplay {
  /** For a 'sending' CAMPAIGN run, the state to show: 'running' while actively draining, 'paused' once
   *  today's daily budget is spent (leftover waits for a human "Lanjutkan"). null for every other run
   *  (draft/sent/partial/failed/stopped, and any workflow run) → the caller uses its normal status map. */
  sendingState: "running" | "paused" | null;
  /** A paused campaign run can be resumed (re-arm the drain). */
  resumable: boolean;
  /** Any 'sending' campaign run — draining OR paused — can be stopped. */
  stoppable: boolean;
}

/**
 * @param status      crm_campaign_run.status
 * @param drainActive crm_campaign_run.drain_active
 * @param isCampaign  true when the run is owned by a segment (a manual campaign), false for a workflow
 *                    run — workflow runs never use the drainer, so their 'sending' stays plain running
 *                    and offers no drain controls.
 */
export function runDrainDisplay(status: string, drainActive: boolean, isCampaign: boolean): RunDrainDisplay {
  const sendingCampaign = status === "sending" && isCampaign;
  return {
    sendingState: sendingCampaign ? (drainActive ? "running" : "paused") : null,
    resumable: sendingCampaign && !drainActive,
    stoppable: sendingCampaign,
  };
}
