import { describe, it, expect } from "vitest";
import { computeProgress, isRunTerminal, reduceProgress, type ProgressState } from "./send-progress";

/**
 * Part A math + the Part B / K-66 rule. The progress screen's state comes from the DATABASE, never
 * from a connection's fate — reduceProgress proves a dropped poll can NEVER become a failed send.
 */
describe("computeProgress", () => {
  it("computes remaining, average rate, and ETA from sent + target + elapsed", () => {
    // 100 sent in 100s → 1/s; target 250 → 150 remaining → ETA 150s.
    const v = computeProgress({ sent: 100, target: 250, startedAtMs: 0, nowMs: 100_000 });
    expect(v.remaining).toBe(150);
    expect(v.ratePerSec).toBeCloseTo(1, 5);
    expect(v.etaSeconds).toBe(150);
  });
  it("rate is null before the first send; ETA null when rate or target unknown", () => {
    expect(computeProgress({ sent: 0, target: 250, startedAtMs: 0, nowMs: 100_000 }).ratePerSec).toBeNull();
    expect(computeProgress({ sent: 10, target: null, startedAtMs: 0, nowMs: 10_000 }).remaining).toBeNull();
    expect(computeProgress({ sent: 10, target: null, startedAtMs: 0, nowMs: 10_000 }).etaSeconds).toBeNull();
  });
  it("ETA is 0 (not null) exactly when nothing remains", () => {
    expect(computeProgress({ sent: 250, target: 250, startedAtMs: 0, nowMs: 100_000 }).etaSeconds).toBe(0);
  });
});

describe("isRunTerminal", () => {
  it("sending/draft are live; sent/partial/failed/stopped are terminal", () => {
    expect(isRunTerminal("sending")).toBe(false);
    expect(isRunTerminal("draft")).toBe(false);
    for (const s of ["sent", "partial", "failed", "stopped"]) expect(isRunTerminal(s)).toBe(true);
  });
});

describe("reduceProgress (K-66: status from DB, never from connection)", () => {
  const sending: ProgressState = { status: "sending", sent: 265, notFound: false };

  it("a successful poll adopts the DB status + sent-count", () => {
    expect(reduceProgress({ status: null, sent: 0, notFound: false }, { ok: true, status: "sending", sent: 265 }))
      .toEqual({ status: "sending", sent: 265, notFound: false });
  });

  it("a NETWORK blip (dropped connection) changes NOTHING — never a failed status", () => {
    const after = reduceProgress(sending, { ok: false, error: "network" });
    expect(after).toEqual(sending); // still 'sending', from the DB — not 'failed'
    expect(after.status).not.toBe("failed");
  });

  it("a denied poll also keeps the last DB state (no fabricated failure)", () => {
    expect(reduceProgress(sending, { ok: false, error: "denied" })).toEqual(sending);
  });

  it("run_not_found marks not-found but does not invent a status", () => {
    const after = reduceProgress(sending, { ok: false, error: "run_not_found" });
    expect(after.notFound).toBe(true);
    expect(after.status).toBe("sending"); // unchanged; the screen shows not-found, never 'failed'
  });

  it("the incident sequence: sending, then the connection drops → still shows 'sending', not 'failed'", () => {
    let s: ProgressState = { status: null, sent: 0, notFound: false };
    s = reduceProgress(s, { ok: true, status: "sending", sent: 265 }); // first poll
    s = reduceProgress(s, { ok: false, error: "network" }); // browser/proxy timed out mid-send
    s = reduceProgress(s, { ok: false, error: "network" });
    expect(s.status).toBe("sending");
    expect(isRunTerminal(s.status!)).toBe(false); // the server is still sending; the UI does not lie
  });
});
