import { describe, it, expect } from "vitest";
import { nextRunStatus } from "./campaign-run-status";

/**
 * The run-status rule is the pure part of crm_campaign_run wiring: given a completed send's summary,
 * where does the instance land? This locks the three outcomes (and their precedence) that decide
 * whether the composer will offer the run for RESUME again — a wrong answer here silently hides a
 * half-sent run, or keeps offering a finished one.
 */
describe("nextRunStatus", () => {
  it("marks a fully-handled run 'sent' (nothing deferred, no stop)", () => {
    expect(nextRunStatus({ deferredDailyLimit: 0, stoppedHighBounce: false })).toBe("sent");
  });

  it("keeps a run 'sending' when the daily limit deferred recipients (resume tomorrow finishes it)", () => {
    expect(nextRunStatus({ deferredDailyLimit: 4200, stoppedHighBounce: false })).toBe("sending");
  });

  it("marks a run 'stopped' when the bounce auto-stop tripped", () => {
    expect(nextRunStatus({ deferredDailyLimit: 0, stoppedHighBounce: true })).toBe("stopped");
  });

  it("prefers 'stopped' over 'sending' — a bounce halt is the fact to surface, not 'more to send'", () => {
    // Both conditions true: the run was halted AND some were left unsent. The halt wins so the
    // operator sees the run was stopped for bounces, not merely paused at the daily limit.
    expect(nextRunStatus({ deferredDailyLimit: 500, stoppedHighBounce: true })).toBe("stopped");
  });
});
