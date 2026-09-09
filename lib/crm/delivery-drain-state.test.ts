import { describe, it, expect } from "vitest";
import { runDrainDisplay } from "./delivery-drain-state";

describe("runDrainDisplay — a run's drain state + controls in Deliveries (P0-3)", () => {
  it("a segment run actively draining reads 'running' and offers only Stop", () => {
    expect(runDrainDisplay("sending", true, true)).toEqual({
      sendingState: "running",
      resumable: false,
      stoppable: true,
    });
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
