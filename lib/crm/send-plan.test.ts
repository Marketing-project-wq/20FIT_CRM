import { describe, it, expect } from "vitest";
import { describeCountDrift, planDailySpread } from "./send-plan";

describe("send-plan — count drift disclosure", () => {
  it("reports no change when the recount matches", () => {
    expect(describeCountDrift(1204, 1204)).toEqual({ changed: false, shown: 1204, fresh: 1204, delta: 0 });
  });
  it("reports a drop (more suppressed since the form opened)", () => {
    const d = describeCountDrift(1204, 1198);
    expect(d.changed).toBe(true);
    expect(d.delta).toBe(-6);
  });
  it("reports a rise (more matches since the form opened)", () => {
    expect(describeCountDrift(1000, 1007).delta).toBe(7);
  });
});

describe("send-plan — daily spread (segment larger than the daily quota)", () => {
  it("fits in one day when within the remaining budget", () => {
    expect(planDailySpread(300, 1000, 1000)).toEqual({
      recipientCount: 300, sentToday: 300, leftover: 0, daysNeeded: 1, exceedsToday: false,
    });
  });
  it("spans multiple days when the segment exceeds the quota (5,000 @ 1,000/day)", () => {
    const p = planDailySpread(5000, 1000, 1000);
    expect(p.sentToday).toBe(1000);
    expect(p.leftover).toBe(4000);
    expect(p.daysNeeded).toBe(5); // 1 today + ceil(4000/1000)
    expect(p.exceedsToday).toBe(true);
  });
  it("counts from tomorrow when today's budget is already spent", () => {
    const p = planDailySpread(2500, 0, 1000);
    expect(p.sentToday).toBe(0);
    expect(p.leftover).toBe(2500);
    expect(p.daysNeeded).toBe(3); // 0 today + ceil(2500/1000)
    expect(p.exceedsToday).toBe(true);
  });
  it("handles a partial remaining budget", () => {
    const p = planDailySpread(1200, 400, 1000);
    expect(p.sentToday).toBe(400);
    expect(p.leftover).toBe(800);
    expect(p.daysNeeded).toBe(2); // 1 today + ceil(800/1000)
  });
  it("is a no-op for an empty segment", () => {
    expect(planDailySpread(0, 1000, 1000)).toEqual({
      recipientCount: 0, sentToday: 0, leftover: 0, daysNeeded: 0, exceedsToday: false,
    });
  });
});
