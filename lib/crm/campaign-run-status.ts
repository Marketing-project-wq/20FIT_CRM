/**
 * Pure run-status vocabulary + decision for crm_campaign_run. Kept OUT of campaign-run.ts (which is
 * server-only, holding the Supabase I/O) so the rule can be unit-tested and imported anywhere. A run
 * is one campaign instance; its status decides whether the composer offers it for RESUME again.
 */

export type RunStatus = "draft" | "sending" | "sent" | "stopped" | "partial" | "failed";

/**
 * THE ONLY statuses a run may be resumed from. This is the list `listResumableRuns` queries on, and
 * it is deliberately a named constant: the whole point of adding `partial` and `failed` (T-42) was to
 * stop a run that mostly or wholly FAILED from being reported as `sent`, and the one way that could
 * turn into damage is if a new status quietly became resumable — resuming the 3 Sep run would mean
 * re-contacting 18,119 people, part of whom were already reached through another tool. A finished or
 * halted run is finished: a fresh issue is a NEW run, with new idempotency keys.
 */
export const RESUMABLE_RUN_STATUSES: readonly RunStatus[] = ["draft", "sending"];

export function isResumableRunStatus(status: string): boolean {
  return (RESUMABLE_RUN_STATUSES as readonly string[]).includes(status);
}

/** What a completed send actually did, reduced to the numbers the status decision needs. `failed` is
 *  the TOTAL across every cause (see totalFailed in send-run.ts). */
export interface RunOutcomeCounts {
  sent: number;
  failed: number;
  deferredDailyLimit: number;
  stoppedHighBounce: boolean;
  stoppedConsecutiveFailures: boolean;
}

/**
 * Where a run lands after a completed send, from that send's summary:
 *   - halted by one of the auto-stops → 'stopped' (a human decides whether to start a new run)
 *   - failures with NOTHING sent      → 'failed'  (the run achieved nothing — say so)
 *   - failures alongside successes    → 'partial' (some got it, some didn't)
 *   - recipients deferred by the daily limit → 'sending' (more remain; resuming finishes them)
 *   - otherwise → 'sent' (every sendable recipient was handled, none failed)
 *
 * The failure branches sit ABOVE the deferral branch on purpose: 'sending' is the one outcome that
 * invites a resume, and a run that is failing should never invite one.
 *
 * WHY `failed` EXISTS AT ALL: before this, the rule never looked at the failure counts, so a run
 * where every single recipient failed was written to the database as `sent` — the operator's screen,
 * the deliveries list and the run row all said the campaign had gone out. That is precisely how the
 * 3 Sep 2026 run (124 accepted, 18,119 failed) was recorded as `sent` (T-42).
 */
export function nextRunStatus(outcome: RunOutcomeCounts): RunStatus {
  if (outcome.stoppedHighBounce || outcome.stoppedConsecutiveFailures) return "stopped";
  if (outcome.failed > 0) return outcome.sent > 0 ? "partial" : "failed";
  if (outcome.deferredDailyLimit > 0) return "sending";
  return "sent";
}
