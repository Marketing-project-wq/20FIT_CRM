import { describe, it, expect } from "vitest";
import { ALL_SCREENS, BILINGUAL_SCREENS, PENDING_SCREENS } from "./coverage";

/**
 * Exhaustiveness guard (Sprint 4F). A screen must never exist in a SILENT state — Indonesian text
 * with neither a marker nor a translation. Every ScreenId is therefore required to be classified:
 * either BILINGUAL (fully translated, marker hidden) or PENDING (marker shown, work-in-progress).
 *
 * If a future screen adds a ScreenId to ALL_SCREENS but forgets to classify it, this fails — the
 * screen cannot be born silent. If someone lists an id in BOTH sets (a screen can't be both done
 * and pending), this fails too.
 */
describe("coverage registry exhaustiveness", () => {
  it("classifies every screen as exactly bilingual OR pending", () => {
    for (const screen of ALL_SCREENS) {
      const inBilingual = BILINGUAL_SCREENS.has(screen);
      const inPending = PENDING_SCREENS.has(screen);
      expect(
        inBilingual !== inPending,
        `${screen}: must be in exactly one of BILINGUAL_SCREENS / PENDING_SCREENS (bilingual=${inBilingual}, pending=${inPending})`,
      ).toBe(true);
    }
  });

  it("has no set member outside ALL_SCREENS", () => {
    const all = new Set<string>(ALL_SCREENS);
    BILINGUAL_SCREENS.forEach((s) => expect(all.has(s), `BILINGUAL_SCREENS has unknown screen ${s}`).toBe(true));
    PENDING_SCREENS.forEach((s) => expect(all.has(s), `PENDING_SCREENS has unknown screen ${s}`).toBe(true));
  });
});
