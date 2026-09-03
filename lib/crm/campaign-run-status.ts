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
 * Where a run lands after a completed send, from that send's summary. THE ORDER IS THE RULE:
 *   1. halted by an auto-stop → 'stopped' (a human decides whether to start a new run)
 *   2. recipients deferred by the daily limit → 'sending' (more remain; resuming finishes them)
 *   3. failures → 'partial' when something was sent, 'failed' when nothing was
 *   4. otherwise → 'sent' (every sendable recipient was handled, none failed)
 *
 * WHY DEFERRAL OUTRANKS FAILURE (step 2 before step 3) — this order was WRONG on the first pass and
 * the reason is worth keeping. A campaign larger than the daily ceiling is finished by resuming the
 * SAME run: same campaign_id → same deterministic idempotency keys → whoever already received it is
 * skipped. Put the failure branch first and a 12,000-person send whose day 1 was
 * {sent 1,000, deferred 11,000, failed 3} lands in 'partial'. 'partial' is not resumable, so the
 * 11,000 are stranded, the operator's only move is a NEW run, a new run means a new campaign_id,
 * a new campaign_id means new keys — and the 1,000 who already received the message receive it
 * again. Three incidental failures would have caused a double send to a thousand people (T-46).
 *
 * "Three recipients failed" and "this run failed" are not the same claim. While recipients remain
 * unsent, the correct action is to continue, and the systemic guards have their own branch above:
 * a real wall (bounce ratio, 20 consecutive failures) returns 'stopped' at step 1 and never reaches
 * 'sending'. So the failure branches decide only the END state of a run with nothing left to send —
 * which is exactly what they were added for.
 *
 * WHY `failed` EXISTS AT ALL: before this, the rule never looked at the failure counts, so a run
 * where every single recipient failed was written to the database as `sent` — the operator's screen,
 * the deliveries list and the run row all said the campaign had gone out. That is precisely how the
 * 3 Sep 2026 run (124 accepted, 18,119 failed) was recorded as `sent` (T-42).
 *
 * Failures are NOT hidden by 'sending': the deliveries list shows a run's failure count from
 * crm_message_log whatever its status is (lib/crm/deliveries.ts), so a 'sending' run carrying
 * failures still reads as one on screen.
 */
export function nextRunStatus(outcome: RunOutcomeCounts): RunStatus {
  if (outcome.stoppedHighBounce || outcome.stoppedConsecutiveFailures) return "stopped";
  if (outcome.deferredDailyLimit > 0) return "sending";
  if (outcome.failed > 0) return outcome.sent > 0 ? "partial" : "failed";
  return "sent";
}
