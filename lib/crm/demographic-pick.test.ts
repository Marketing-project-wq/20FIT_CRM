import { describe, it, expect } from "vitest";
import {
  pickBirthDate,
  pickGender,
  normalizeGender,
  clinicProvenanceLabel,
  DOB_PRIORITY,
  GENDER_PRIORITY,
} from "./demographic-pick";

describe("pickBirthDate — priority chain", () => {
  it("prefers NIK over every other source", () => {
    const r = pickBirthDate({
      nik: { iso: "1990-05-12" },
      staging: { iso: "1990-12-05" },
      clinic: { iso: "1990-01-01" },
      hyrox: { iso: "1990-02-02" },
      staff: { iso: "1990-03-03" },
    });
    expect(r.iso).toBe("1990-05-12");
    expect(r.source).toBe("nik");
  });

  it("falls through to staging when the NIK has no usable date", () => {
    const r = pickBirthDate({ nik: { iso: null }, staging: { iso: "1988-02-28" } });
    expect(r.iso).toBe("1988-02-28");
    expect(r.source).toBe("staging");
  });

  it("falls to clinic, then hyrox, then staff as earlier sources go empty", () => {
    expect(pickBirthDate({ clinic: { iso: "1980-01-01" }, hyrox: { iso: "1980-02-02" } }).source).toBe("clinic");
    expect(pickBirthDate({ hyrox: { iso: "1980-02-02" }, staff: { iso: "1980-03-03" } }).source).toBe("hyrox");
    expect(pickBirthDate({ staff: { iso: "1980-03-03" } }).source).toBe("staff");
  });

  it("a NIK with no date NEVER wins — it drops, not forced", () => {
    const r = pickBirthDate({ nik: { iso: null }, hyrox: { iso: "1975-06-06" } });
    expect(r.source).toBe("hyrox");
  });

  it("reports OTHER sources that disagree with the chosen value", () => {
    const r = pickBirthDate({
      nik: { iso: "1990-05-12" },
      staging: { iso: "1990-12-05" }, // day/month swap vs NIK
      clinic: { iso: "1990-05-12" }, // agrees — not a conflict
    });
    expect(r.conflicts).toEqual([{ source: "staging", iso: "1990-12-05" }]);
  });

  it("no conflicts when all present sources agree", () => {
    const r = pickBirthDate({ nik: { iso: "1990-05-12" }, staging: { iso: "1990-05-12" } });
    expect(r.conflicts).toEqual([]);
  });

  it("carries the chosen value's ambiguity flag (century for NIK)", () => {
    const r = pickBirthDate({ nik: { iso: "2005-01-02", ambiguous: true } });
    expect(r.ambiguous).toBe(true);
  });

  it("ambiguity of a NON-chosen source does not leak onto the pick", () => {
    const r = pickBirthDate({ nik: { iso: "1990-05-12", ambiguous: false }, staging: { iso: "1990-12-05", ambiguous: true } });
    expect(r.ambiguous).toBe(false);
  });

  it("empty in → null pick, no source, no conflicts", () => {
    expect(pickBirthDate({})).toEqual({ iso: null, source: null, ambiguous: false, conflicts: [] });
    expect(pickBirthDate({ nik: { iso: null }, staging: null })).toEqual({ iso: null, source: null, ambiguous: false, conflicts: [] });
  });

  it("the canonical order is nik → staging → clinic → hyrox → staff", () => {
    expect(DOB_PRIORITY).toEqual(["nik", "staging", "clinic", "hyrox", "staff"]);
  });
});

describe("pickGender — priority chain", () => {
  it("prefers NIK, then clinic, then staff", () => {
    expect(pickGender({ nik: "female", clinic: "male", staff: "male" }).source).toBe("nik");
    expect(pickGender({ clinic: "male", staff: "female" }).source).toBe("clinic");
    expect(pickGender({ staff: "female" }).source).toBe("staff");
  });
  it("reports disagreement between sources", () => {
    const r = pickGender({ nik: "female", clinic: "male" });
    expect(r.value).toBe("female");
    expect(r.conflicts).toEqual([{ source: "clinic", value: "male" }]);
  });
  it("no conflict when sources agree", () => {
    expect(pickGender({ nik: "male", clinic: "male" }).conflicts).toEqual([]);
  });
  it("empty in → null", () => {
    expect(pickGender({})).toEqual({ value: null, source: null, conflicts: [] });
  });
  it("canonical order is nik → clinic → staff", () => {
    expect(GENDER_PRIORITY).toEqual(["nik", "clinic", "staff"]);
  });
});

describe("clinicProvenanceLabel (T-21 — coarsen clinic membership for non-health roles)", () => {
  it("a view_health caller sees the precise 'klinik' label", () => {
    expect(clinicProvenanceLabel(true)).toBe("klinik");
  });
  it("a caller WITHOUT view_health never gets 'klinik' — only the coarse ecosystem label", () => {
    // This is the whole T-21 fix: the string "klinik" must not be produced for a non-health role.
    expect(clinicProvenanceLabel(false)).toBe("sumber ekosistem");
    expect(clinicProvenanceLabel(false)).not.toBe("klinik");
    expect(clinicProvenanceLabel(false).toLowerCase()).not.toContain("klinik");
  });
});

describe("normalizeGender", () => {
  it("maps Indonesian + coded forms", () => {
    expect(normalizeGender("Laki-laki")).toBe("male");
    expect(normalizeGender("PEREMPUAN")).toBe("female");
    expect(normalizeGender("male")).toBe("male");
    expect(normalizeGender("F")).toBe("female");
  });
  it("null / unknown → null", () => {
    expect(normalizeGender(null)).toBeNull();
    expect(normalizeGender("")).toBeNull();
    expect(normalizeGender("xyz")).toBeNull();
  });
});
