import { describe, it, expect } from "vitest";
import { runDrainDisplay, STALL_MINUTES } from "./delivery-drain-state";

describe("runDrainDisplay — a run's drain state + controls in Deliveries (P0-3)", () => {
  it("a segment run actively draining (recent progress) reads 'running' and offers only Stop", () => {
    expect(runDrainDisplay("sending", true, true, 2)).toEqual({
      sendingState: "running",
      resumable: false,
      stoppable: true,
    });
  });

  it("a drain-active run with NO progress past the threshold reads 'stalled' (zombie made loud)", () => {
    // The executor died mid-drain: drain_active is still true, but nothing has progressed. Without this
    // it would read 'running' forever — a dead run looking alive. Still stoppable, not resumable.
    expect(runDrainDisplay("sending", true, true, STALL_MINUTES + 1)).toEqual({
      sendingState: "stalled",
      resumable: false,
      stoppable: true,
    });
  });

  it("exactly AT the threshold is not yet stalled (only strictly past it)", () => {
    expect(runDrainDisplay("sending", true, true, STALL_MINUTES).sendingState).toBe("running");
  });

  it("null progress (unknown) never forces 'stalled' — a fresh drain-active run reads 'running'", () => {
    expect(runDrainDisplay("sending", true, true, null).sendingState).toBe("running");
  });

  it("a PAUSED run is never 'stalled' even after a long silence — pause is deliberate, not stuck", () => {
    // drain_active=false means the daily budget was spent on purpose; silence there is expected.
    expect(runDrainDisplay("sending", false, true, 999).sendingState).toBe("paused");
  });

  it("a segment run paused at the daily budget reads 'paused' and offers Resume + Stop", () => {
    expect(runDrainDisplay("sending", false, true)).toEqual({
      sendingState: "paused",
      resumable: true,
      stoppable: true,
    });
  });

  it("a FINISHED run is never resumable — no Lanjutkan button on a done/partial/failed run (re-send guard)", () => {
    for (const status of ["sent", "partial", "failed", "stopped", "draft"]) {
      const d = runDrainDisplay(status, false, true);
      expect(d.sendingState).toBeNull(); // caller uses the normal status map
      expect(d.resumable).toBe(false);
      expect(d.stoppable).toBe(false);
    }
  });

  it("a WORKFLOW run never shows drain state or controls, even while 'sending'", () => {
    // isCampaign=false → the drainer never touches it, so it must not read as paused or offer Resume.
    expect(runDrainDisplay("sending", true, false)).toEqual({
      sendingState: null,
      resumable: false,
      stoppable: false,
    });
    expect(runDrainDisplay("sending", false, false)).toEqual({
      sendingState: null,
      resumable: false,
      stoppable: false,
    });
  });
});
