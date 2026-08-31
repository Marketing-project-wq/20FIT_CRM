import { describe, it, expect } from "vitest";
import { evaluateBounceStop, BOUNCE_AUTOSTOP_ACTIVE } from "./bounce-monitor";

const CFG = { threshold: 0.05, minSample: 20 };

describe("bounce-monitor — post-send auto-stop evaluation (ACTIVATED 31 Aug 2026)", () => {
  it("is active by default now (reflects BOUNCE_AUTOSTOP_ACTIVE)", () => {
    expect(BOUNCE_AUTOSTOP_ACTIVE).toBe(true);
    expect(evaluateBounceStop({ hardBounces: 100, attempted: 100 }, CFG).active).toBe(true);
  });

  it("does NOT trip from near-zero sends — the 'weird from zero' guard (dataSufficient)", () => {
    // 1 bounce out of 3 sends = 33%, but below the minimum sample → wouldStop false, so no stop
    // even though the monitor is active. This is what makes activation safe.
    const r = evaluateBounceStop({ hardBounces: 1, attempted: 3 }, CFG);
    expect(r.dataSufficient).toBe(false);
    expect(r.wouldStop).toBe(false);
    expect(r.stop).toBe(false);
  });

  it("a fresh run (0 prior attempts) can never be pre-halted", () => {
    const r = evaluateBounceStop({ hardBounces: 0, attempted: 0 }, CFG);
    expect(r.ratio).toBe(0); // not NaN
    expect(r.stop).toBe(false);
  });

  it("stop = active && wouldStop once there is a sufficient sample above 5%", () => {
    const r = evaluateBounceStop({ hardBounces: 2, attempted: 20 }, CFG); // 10% of 20
    expect(r.dataSufficient).toBe(true);
    expect(r.wouldStop).toBe(true);
    expect(r.stop).toBe(true); // active AND wouldStop → the effective halt
  });

  it("does NOT stop while inactive, even past threshold (measure-only fallback)", () => {
    const r = evaluateBounceStop({ hardBounces: 2, attempted: 20 }, CFG, false);
    expect(r.wouldStop).toBe(true); // the arithmetic still fires
    expect(r.active).toBe(false);
    expect(r.stop).toBe(false); // but nothing is halted
  });

  it("would NOT trip at exactly 5% with a sufficient sample (must EXCEED)", () => {
    const r = evaluateBounceStop({ hardBounces: 1, attempted: 20 }, CFG); // 5% of 20
    expect(r.wouldStop).toBe(false);
    expect(r.stop).toBe(false);
  });
});
