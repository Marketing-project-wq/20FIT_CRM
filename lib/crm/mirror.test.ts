import { describe, it, expect } from "vitest";
import { activeMirrorFlagColumns } from "./mirror-constants";
import { EMPTY_CRITERIA, type SegmentCriteria } from "./segment";

/**
 * The mirror serves EXACTLY the five source-presence flags — no more. This test pins that set so
 * a future criterion is not silently routed through the mirror (which would need its own column +
 * a fresh equality proof). The criteria the mirror deliberately cannot reproduce — recency,
 * clinic-txn, RFM, program/Fitco, ecosystem — must NOT appear here; they stay on live resolvers.
 */
function crit(overrides: Partial<SegmentCriteria>): SegmentCriteria {
  return { ...EMPTY_CRITERIA, ...overrides };
}

describe("activeMirrorFlagColumns — the mirror-served presence flags", () => {
  it("returns nothing for empty criteria", () => {
    expect(activeMirrorFlagColumns(EMPTY_CRITERIA)).toEqual([]);
  });

  it("maps each of the five presence flags to its column", () => {
    expect(activeMirrorFlagColumns(crit({ srcHyrox: true }))).toEqual(["has_hyrox"]);
    expect(activeMirrorFlagColumns(crit({ srcMy20fit: true }))).toEqual(["has_my20fit"]);
    expect(activeMirrorFlagColumns(crit({ srcArena: true }))).toEqual(["has_arena"]);
    expect(activeMirrorFlagColumns(crit({ srcGym: true }))).toEqual(["has_gym"]);
    expect(activeMirrorFlagColumns(crit({ srcClinicPatient: true }))).toEqual(["has_clinic"]);
  });

  it("returns all five together, in a stable order (AND-ed in one query)", () => {
    const all = crit({
      srcHyrox: true,
      srcMy20fit: true,
      srcArena: true,
      srcGym: true,
      srcClinicPatient: true,
    });
    expect(activeMirrorFlagColumns(all)).toEqual([
      "has_hyrox",
      "has_my20fit",
      "has_arena",
      "has_gym",
      "has_clinic",
    ]);
  });

  it("does NOT route the mirror-incapable criteria (recency/clinicTxn/rfm/program/eco) through it", () => {
    const nonMirror = crit({
      srcRecency: true,
      srcClinicTxn: true,
      srcRfm: "New User",
      srcProgram: "hyrox",
      ecoUnit: "arena",
      ecoProduct: null,
      unit: "gym",
      city: "Jakarta",
      revenue: "has",
      hasEmail: true,
    });
    // Only the master + non-mirror source criteria are set → the mirror serves none of them.
    expect(activeMirrorFlagColumns(nonMirror)).toEqual([]);
  });
});
