import { describe, it, expect } from "vitest";
import { validateSendLimits, isLargeRaise, DAILY_LIMIT_DEFAULT } from "./send-limits";

describe("validateSendLimits", () => {
  it("accepts positive integers with cap <= limit", () => {
    expect(validateSendLimits({ dailyLimit: 1000, workflowDailyCap: 300 })).toEqual({ ok: true });
    expect(validateSendLimits({ dailyLimit: 500, workflowDailyCap: 500 })).toEqual({ ok: true });
  });
  it("rejects a sub-cap larger than the daily limit (a sub-cap bigger than the whole is meaningless)", () => {
    expect(validateSendLimits({ dailyLimit: 300, workflowDailyCap: 1000 })).toEqual({ ok: false, error: "cap_over_limit" });
  });
  it("rejects zero / negative / non-integer", () => {
    expect(validateSendLimits({ dailyLimit: 0, workflowDailyCap: 0 }).ok).toBe(false);
    expect(validateSendLimits({ dailyLimit: -5, workflowDailyCap: 1 }).ok).toBe(false);
    expect(validateSendLimits({ dailyLimit: 1000, workflowDailyCap: 1.5 }).ok).toBe(false);
  });
});

describe("isLargeRaise — the reputation warning fires on more than a doubling", () => {
  it("warns when the new limit more than doubles the old", () => {
    expect(isLargeRaise(1000, 2001)).toBe(true);
    expect(isLargeRaise(1000, 10000)).toBe(true);
  });
  it("does not warn for a modest raise or a decrease", () => {
    expect(isLargeRaise(1000, 2000)).toBe(false); // exactly double, not "more than"
    expect(isLargeRaise(1000, 1500)).toBe(false);
    expect(isLargeRaise(1000, 500)).toBe(false);
  });
  it("uses the default ceiling as the baseline when there is no sensible previous", () => {
    expect(isLargeRaise(0, DAILY_LIMIT_DEFAULT * 2 + 1)).toBe(true);
    expect(isLargeRaise(0, DAILY_LIMIT_DEFAULT * 2)).toBe(false);
  });
});
