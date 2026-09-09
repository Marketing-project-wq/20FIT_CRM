/**
 * Pure decisions + constants for the background send drainer (P0-3). Kept OUT of send-drain.ts (which
 * is server-only, holding the Supabase I/O) so the batch→next-state rule is unit-testable and
 * importable anywhere — same split as campaign-run-status.ts vs campaign-run.ts.
 */

import type { SendSummary } from "./send-run";

/** Max SEND attempts per tick — bounds one executor invocation to a few minutes so ticks never run
 *  long (200 * ~0.8s ≈ 2.7 min). The daily limit still bounds the DAY; this bounds the TICK. */
export const DRAIN_BATCH = 200;

/** A drain claim older than this is treated as stale (the tick that set it crashed): a later tick may
 *  re-claim. Generous vs a ~3-min batch, so a healthy tick is never stolen; idempotency (the unique
 *  crm_message_log key) is what actually prevents a double send, so this window is efficiency only. */
export const DRAIN_CLAIM_STALE_MS = 10 * 60 * 1000;

/** How many drainable runs one tick claims. Small: runs share the daily budget, so once one run
 *  spends it the rest pause on their next batch anyway — no need to sweep the whole table per tick. */
export const DRAIN_RUNS_PER_TICK = 5;

/**
 * Where a run goes after ONE drained batch, from that batch's summary. THE ORDER IS THE RULE:
 *   1. an auto-stop (bounce ratio / consecutive-failure wall) → 'stopped'.
 *   2. `haltedForBatch` → 'continue': the batch cap was reached with recipients still to send RIGHT
 *      NOW → the drainer re-arms and the next tick continues.
 *   3. `deferredDailyLimit > 0` → 'paused_daily_limit': today's shared budget is spent → the run stays
 *      'sending' but drain_active is cleared, and the leftover waits for a HUMAN "Lanjutkan"
 *      (the planDailySpread decision — never a silent cross-day continue).
 *   4. otherwise → 'done': every remaining recipient was handled this cycle.
 *
 * (2) before (3) matters: `haltedForBatch` and `deferredDailyLimit` are mutually exclusive in the
 * engine — once the budget hits 0 no further sends occur so the cap can't be reached, and once the cap
 * is reached the loop breaks before deferring — but ordering continue first keeps the rule robust if
 * that ever changes: a batch with more to send NOW is always continued, not paused.
 *
 * (1) before all: a wall means the domain is being hurt (bounces) or the provider is down (20 in a
 * row) — that outranks "there is more to send", exactly as it does inside a single inline run.
 */
export type DrainNext = "continue" | "paused_daily_limit" | "stopped" | "done";

export function nextDrainState(summary: SendSummary): DrainNext {
  if (summary.stoppedHighBounce || summary.stoppedConsecutiveFailures) return "stopped";
  if (summary.haltedForBatch) return "continue";
  if (summary.deferredDailyLimit > 0) return "paused_daily_limit";
  return "done";
}
