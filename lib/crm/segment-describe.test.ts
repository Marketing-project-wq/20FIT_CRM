import { describe, it, expect } from "vitest";
import { describePresence } from "./segment-describe";
import { EMPTY_CRITERIA, type SegmentCriteria } from "./segment";

function crit(over: Partial<SegmentCriteria>): SegmentCriteria {
  return { ...EMPTY_CRITERIA, ...over, exclude: { ...EMPTY_CRITERIA.exclude, ...(over.exclude ?? {}) } };
}

describe("describePresence — the 'Filter terbaca' line must state exclusions (Track A binding)", () => {
  it("empty → empty string (caller shows nothing)", () => {
    expect(describePresence(EMPTY_CRITERIA, "id")).toBe("");
  });

  it("Track A opening segment reads as a plain sentence with the exclusions", () => {
    // Event participant, NOT a member, NEVER been to arena — the 11,563 segment.
    const c = crit({ ecoUnit: "event", exclude: { ecoUnit: "membership", srcArena: true, srcGym: false, srcHyrox: false, srcMy20fit: false, srcRecency: false } });
    expect(describePresence(c, "id")).toBe("peserta event, bukan anggota membership, belum pernah ke arena");
  });

  it("no-app segment (exclusion-only) reads clearly", () => {
    const c = crit({ exclude: { ecoUnit: null, srcArena: false, srcGym: false, srcHyrox: false, srcMy20fit: true, srcRecency: false } });
    expect(describePresence(c, "id")).toBe("belum punya akun aplikasi");
    expect(describePresence(c, "en")).toBe("has no app account");
  });

  it("an exclusion is NEVER silently dropped — every active exclusion appears", () => {
    const c = crit({ ecoUnit: "event", exclude: { ecoUnit: "membership", srcArena: true, srcGym: true, srcHyrox: true, srcMy20fit: true, srcRecency: true } });
    const s = describePresence(c, "id");
    for (const needle of ["bukan anggota", "belum pernah ke arena", "belum pernah ke gym", "belum pernah ikut Hyrox", "belum punya akun aplikasi", "tak ada aktivitas nyata"]) {
      expect(s).toContain(needle);
    }
  });
});
