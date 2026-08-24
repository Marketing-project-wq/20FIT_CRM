/**
 * Pure run-status vocabulary + decision for crm_campaign_run. Kept OUT of campaign-run.ts (which is
 * server-only, holding the Supabase I/O) so the rule can be unit-tested and imported anywhere. A run
 * is one campaign instance; its status decides whether the composer offers it for RESUME again.
 */

export type RunStatus = "draft" | "sending" | "sent" | "stopped";

/**
 * Where a run lands after a completed send, from that send's summary:
 *   - stopped for high bounce → 'stopped' (the auto-stop tripped; a human decides whether to resume)
 *   - some recipients deferred by the daily limit → 'sending' (more remain; resuming tomorrow finishes)
 *   - otherwise → 'sent' (every sendable recipient was handled this run)
 * 'stopped' takes precedence over a daily-limit deferral: if the run was halted for bounces, that is
 * the fact to surface, not "there is more to send".
 */
export function nextRunStatus(summary: { deferredDailyLimit: number; stoppedHighBounce: boolean }): RunStatus {
  if (summary.stoppedHighBounce) return "stopped";
  if (summary.deferredDailyLimit > 0) return "sending";
  return "sent";
}
