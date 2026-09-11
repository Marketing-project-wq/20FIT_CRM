import { describe, it, expect } from "vitest";
import { nextDrainState, DRAIN_BATCH, DRAIN_RUNS_PER_TICK } from "./send-drain-plan";
import { emptySendFailureCounts, type SendSummary } from "./send-run";

/** A drained-batch summary with everything zero/false, overridden per case. */
function summary(over: Partial<SendSummary> = {}): SendSummary {
  return {
    attempted: 0,
    sent: 0,
    skippedSuppressed: 0,
    skippedAlreadySent: 0,
    failed: emptySendFailureCounts(),
    deferredDailyLimit: 0,
    stoppedHighBounce: false,
    stoppedConsecutiveFailures: false,
    retriedSends: 0,
    haltedForBatch: false,
    ...over,
  };
}

describe("nextDrainState — one batch → the run's next drain state", () => {
  it("an auto-stop (high bounce) → stopped, outranking everything", () => {
    // Even with more to send this cycle, a bounce wall stops the run — the domain matters more.
    expect(nextDrainState(summary({ stoppedHighBounce: true, haltedForBatch: true }))).toBe("stopped");
  });

  it("the consecutive-failure wall → stopped", () => {
    expect(nextDrainState(summary({ stoppedConsecutiveFailures: true }))).toBe("stopped");
  });

  it("batch cap reached with more to send → continue (re-arm next tick)", () => {
    expect(nextDrainState(summary({ sent: DRAIN_BATCH, haltedForBatch: true }))).toBe("continue");
  });

  it("today's daily budget spent → paused_daily_limit (waits for a human Lanjutkan)", () => {
    expect(nextDrainState(summary({ sent: 3, deferredDailyLimit: 7 }))).toBe("paused_daily_limit");
  });

  it("nothing left this cycle → done", () => {
    expect(nextDrainState(summary({ sent: 42 }))).toBe("done");
  });

  it("continue OUTRANKS a daily-limit reading (a batch with more to send NOW is never paused)", () => {
    // Defensive: the engine keeps these mutually exclusive, but if both were ever set, 'continue' wins
    // so a run that still has budgeted work this cycle keeps going rather than pausing a full day.
    expect(nextDrainState(summary({ haltedForBatch: true, deferredDailyLimit: 5 }))).toBe("continue");
  });

  it("a drained batch that sent NOTHING (all suppressed/withheld) still → done, not paused", () => {
    // No sends, no deferral, no halt — the list was fully handled (e.g. real-send-off withholds
    // everyone). The run must finish, never spin forever.
    expect(nextDrainState(summary({ sent: 0 }))).toBe("done");
  });
});

describe("send-drain constants", () => {
  it("the per-tick batch cap sits above any realistic campaign, so it never throttles a send", () => {
    // Since 11 Sep 2026 this is a CRASH-RECOVERY unit, not a volume policy: the owner's instruction is
    // that the CRM imposes no ceiling of its own. It must therefore clear the largest known audience
    // (~12k) comfortably, so a whole campaign drains in one tick and the bound never binds.
    expect(DRAIN_BATCH).toBeGreaterThanOrEqual(20000);
  });
  it("claims only a few runs per tick (the daily budget is shared)", () => {
    expect(DRAIN_RUNS_PER_TICK).toBeGreaterThan(0);
    expect(DRAIN_RUNS_PER_TICK).toBeLessThanOrEqual(20);
  });
});
