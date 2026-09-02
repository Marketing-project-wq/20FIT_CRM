import { describe, it, expect } from "vitest";
import {
  parseCriteria,
  activeCriteriaCount,
  hasClinicalCriteria,
  isRevenueCriterion,
  EMPTY_CRITERIA,
  SEGMENT_NULL,
} from "./segment";
import { FILTER_VALUE_MAX } from "./audience-constants";

describe("multi-source criteria (TUGAS 2)", () => {
  it("parses the new source booleans (default false, true only for === true)", () => {
    const c = parseCriteria({ srcArena: true, srcGym: true, srcClinicPatient: true, srcClinicTxn: "yes" });
    expect(c.srcArena).toBe(true);
    expect(c.srcGym).toBe(true);
    expect(c.srcClinicPatient).toBe(true);
    expect(c.srcClinicTxn).toBe(false); // "yes" is not === true → false (closed)
  });
  it("hasClinicalCriteria is true iff a clinic criterion is set (the view_health gate)", () => {
    expect(hasClinicalCriteria(parseCriteria({}))).toBe(false);
    expect(hasClinicalCriteria(parseCriteria({ srcArena: true }))).toBe(false);
    expect(hasClinicalCriteria(parseCriteria({ srcClinicPatient: true }))).toBe(true);
    expect(hasClinicalCriteria(parseCriteria({ srcClinicTxn: true }))).toBe(true);
  });
  it("counts the new criteria as active narrowing", () => {
    expect(activeCriteriaCount(parseCriteria({ srcArena: true, srcClinicTxn: true }))).toBe(2);
  });
});

describe("staging_20fit_data criteria (Sprint 3Y)", () => {
  it("keeps a valid RFM value (incl the Campion misspelling) and program key; rejects unknowns", () => {
    // A LEGACY bare string (criteria saved before multi-select) is accepted and wrapped to a
    // one-element array — the backward-compat path, no data migration.
    expect(parseCriteria({ srcRfm: "Campion user" }).srcRfm).toEqual(["Campion user"]);
    expect(parseCriteria({ srcRfm: "Loyal user" }).srcRfm).toEqual(["Loyal user"]);
    expect(parseCriteria({ srcRfm: "Champion user" }).srcRfm).toEqual([]); // not stored → not accepted
    expect(parseCriteria({ srcRfm: "-" }).srcRfm).toEqual([]); // absence, not a bucket
    expect(parseCriteria({ srcProgram: "fitco_user" }).srcProgram).toEqual(["fitco_user"]);
    expect(parseCriteria({ srcProgram: "not_a_program" }).srcProgram).toEqual([]);
  });
  it("accepts a multi-value array, drops unknowns, de-dupes (OR within the criterion)", () => {
    expect(parseCriteria({ srcProgram: ["sportfest_half", "sportfest_double"] }).srcProgram)
      .toEqual(["sportfest_half", "sportfest_double"]);
    expect(parseCriteria({ srcProgram: ["sportfest_half", "nope", "sportfest_half"] }).srcProgram)
      .toEqual(["sportfest_half"]); // unknown dropped, duplicate removed
    expect(parseCriteria({ srcRfm: ["Loyal user", "New User", "Loyal user"] }).srcRfm)
      .toEqual(["Loyal user", "New User"]);
  });
  it("counts RFM + program as active narrowing", () => {
    expect(activeCriteriaCount(parseCriteria({ srcRfm: "New User", srcProgram: "fitco_user" }))).toBe(2);
    expect(activeCriteriaCount(parseCriteria({ srcRfm: "nonsense" }))).toBe(0);
  });
  it("treats a clinic-patient program as CLINICAL (the view_health gate); non-clinic is not", () => {
    expect(hasClinicalCriteria(parseCriteria({ srcProgram: "fitco_user" }))).toBe(false);
    expect(hasClinicalCriteria(parseCriteria({ srcProgram: "clinic_2024_2025" }))).toBe(true);
    expect(hasClinicalCriteria(parseCriteria({ srcProgram: "clinic_2025_2026" }))).toBe(true);
    expect(hasClinicalCriteria(parseCriteria({ srcRfm: "New User" }))).toBe(false);
  });
});

describe("isRevenueCriterion", () => {
  it("accepts the four buckets incl. negative (T-10)", () => {
    for (const v of ["all", "has", "none", "negative"]) expect(isRevenueCriterion(v)).toBe(true);
    expect(isRevenueCriterion("recent")).toBe(false);
    expect(isRevenueCriterion(null)).toBe(false);
  });
});

describe("parseCriteria", () => {
  it("empty body -> all-any criteria", () => {
    expect(parseCriteria({})).toEqual(EMPTY_CRITERIA);
    expect(parseCriteria(null)).toEqual(EMPTY_CRITERIA);
  });
  it("keeps closed-list values, defaults unknown revenue to 'all'", () => {
    const c = parseCriteria({ unit: "arena", segment: "loyal", revenue: "weird" });
    expect(c.unit).toBe("arena");
    expect(c.segment).toBe("loyal");
    expect(c.revenue).toBe("all");
  });
  it("passes the NULL-cohort sentinel through", () => {
    expect(parseCriteria({ segment: SEGMENT_NULL }).segment).toBe(SEGMENT_NULL);
  });
  it("caps the free-text city (K-17) and trims", () => {
    const long = "x".repeat(FILTER_VALUE_MAX + 40);
    const c = parseCriteria({ city: `  ${long}  ` });
    expect(c.city?.length).toBe(FILTER_VALUE_MAX);
  });
  it("blank city -> null", () => {
    expect(parseCriteria({ city: "   " }).city).toBeNull();
  });
  it("coerces the identifier flags to real booleans", () => {
    expect(parseCriteria({ hasPhone: true, hasEmail: 1 })).toMatchObject({ hasPhone: true, hasEmail: false });
  });
  it("has NO way to pass a time-based criterion (K-19) — such keys are ignored", () => {
    const c = parseCriteria({ created_at: "2026-01-01", joined_days: 7, last_activity_at: "x", unit: "gym" });
    expect(c).toEqual({ ...EMPTY_CRITERIA, unit: "gym" });
    expect(Object.keys(c)).not.toContain("created_at");
    expect(Object.keys(c)).not.toContain("last_activity_at");
  });
  it("keeps closed-list ecosystem unit/product, rejects unknown (3N)", () => {
    const c = parseCriteria({ ecoUnit: "membership", ecoProduct: "Fitco User" });
    expect(c.ecoUnit).toBe("membership");
    expect(c.ecoProduct).toBe("Fitco User");
    const bad = parseCriteria({ ecoUnit: "20fit_data", ecoProduct: "Ghost" });
    expect(bad.ecoUnit).toBeNull();
    expect(bad.ecoProduct).toBeNull();
  });
  it("coerces enrichment-source flags to real booleans (3R)", () => {
    expect(parseCriteria({ srcHyrox: true, srcMy20fit: 1, srcRecency: "yes" })).toMatchObject({
      srcHyrox: true, srcMy20fit: false, srcRecency: false,
    });
    expect(parseCriteria({}).srcHyrox).toBe(false);
  });
});

describe("activeCriteriaCount", () => {
  it("empty = 0 (whole pool)", () => {
    expect(activeCriteriaCount(EMPTY_CRITERIA)).toBe(0);
  });
  it("counts each narrowing criterion (incl. ecosystem, 3N)", () => {
    expect(
      activeCriteriaCount({
        unit: "gym", segment: "new", city: "Jakarta", revenue: "has", hasPhone: true, hasEmail: true,
        ecoUnit: "clinic", ecoProduct: "Transaksi Clinic",
        srcHyrox: true, srcMy20fit: true, srcRecency: true,
        srcArena: false, srcGym: false, srcClinicPatient: false, srcClinicTxn: false,
        srcRfm: [], srcProgram: [],
        joinedWithinDays: null, inactiveForDays: null,
        exclude: { ecoUnit: null, srcArena: false, srcGym: false, srcHyrox: false, srcMy20fit: false, srcRecency: false },
      }),
    ).toBe(11);
  });
  it("revenue='all' and blank city do not count", () => {
    expect(activeCriteriaCount({ ...EMPTY_CRITERIA, revenue: "all", city: "  " })).toBe(0);
  });
});
