import { describe, it, expect } from "vitest";
import {
  parseCriteria,
  activeCriteriaCount,
  isRevenueCriterion,
  EMPTY_CRITERIA,
  SEGMENT_NULL,
} from "./segment";
import { FILTER_VALUE_MAX } from "./audience-constants";

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
      }),
    ).toBe(8);
  });
  it("revenue='all' and blank city do not count", () => {
    expect(activeCriteriaCount({ ...EMPTY_CRITERIA, revenue: "all", city: "  " })).toBe(0);
  });
});
