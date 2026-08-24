import { describe, it, expect } from "vitest";
import { evaluateBounceStop } from "./bounce-monitor";

const CFG = { threshold: 0.05, minSample: 20 };

describe("bounce-monitor — post-send auto-stop evaluation (built, NOT activated)", () => {
  it("is never active today (building != enabling)", () => {
    expect(evaluateBounceStop({ hardBounces: 100, attempted: 100 }, CFG).active).toBe(false);
  });

  it("does NOT trip from near-zero sends — the 'weird from zero' guard", () => {
    // 1 bounce out of 3 sends = 33%, but below the minimum sample → wouldStop false.
    const r = evaluateBounceStop({ hardBounces: 1, attempted: 3 }, CFG);
    expect(r.dataSufficient).toBe(false);
    expect(r.wouldStop).toBe(false);
  });

  it("ratio is 0 (not NaN) when nothing has been attempted", () => {
    expect(evaluateBounceStop({ hardBounces: 0, attempted: 0 }, CFG).ratio).toBe(0);
  });

  it("would trip once there is a sufficient sample above 5%", () => {
    const r = evaluateBounceStop({ hardBounces: 2, attempted: 20 }, CFG); // 10% of 20
    expect(r.dataSufficient).toBe(true);
    expect(r.wouldStop).toBe(true);
  });

  it("would NOT trip at exactly 5% with a sufficient sample (must EXCEED)", () => {
    const r = evaluateBounceStop({ hardBounces: 1, attempted: 20 }, CFG); // 5% of 20
    expect(r.wouldStop).toBe(false);
  });
});
