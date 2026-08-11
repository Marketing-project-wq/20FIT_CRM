import { describe, it, expect } from "vitest";
import {
  classifyLastSeen,
  isEcosystemUnit,
  isEcosystemProduct,
  ECOSYSTEM_UNITS,
  ECOSYSTEM_PRODUCTS,
  ECOSYSTEM_PRODUCTS_BY_UNIT,
} from "./engagement-constants";

// A fixed "now" so the test never depends on the wall clock.
const NOW = Date.parse("2026-08-11T00:00:00Z");

describe("classifyLastSeen", () => {
  it("last_seen strictly after first_seen (and not future) = real activity", () => {
    expect(classifyLastSeen("2026-02-06T00:00:00Z", "2026-08-08T00:00:00Z", NOW)).toBe("real_activity");
  });

  it("last_seen EQUAL to first_seen = load stamp (the 99,51% case)", () => {
    expect(classifyLastSeen("2026-04-20T11:46:42Z", "2026-04-20T11:46:42Z", NOW)).toBe("load_stamp");
  });

  it("last_seen in the FUTURE = anomaly, checked before real-activity", () => {
    // Future even though it is also > first_seen — future wins so it is never read as 'recent'.
    expect(classifyLastSeen("2026-02-06T00:00:00Z", "2026-12-05T00:00:00Z", NOW)).toBe("future_anomaly");
  });

  it("last_seen BEFORE first_seen (non-future) is not real activity → load stamp", () => {
    expect(classifyLastSeen("2026-08-08T00:00:00Z", "2026-02-06T00:00:00Z", NOW)).toBe("load_stamp");
  });

  it("null / unparseable last_seen = missing (never a fabricated date)", () => {
    expect(classifyLastSeen("2026-04-20T00:00:00Z", null, NOW)).toBe("missing");
    expect(classifyLastSeen("2026-04-20T00:00:00Z", "not-a-date", NOW)).toBe("missing");
  });

  it("missing first_seen but a real last_seen → load stamp (cannot prove it is later)", () => {
    // No first_seen to compare against, and not future → the honest fallback is load_stamp,
    // not real_activity. We never claim activity we cannot demonstrate.
    expect(classifyLastSeen(null, "2026-06-01T00:00:00Z", NOW)).toBe("load_stamp");
  });
});

describe("ecosystem vocabulary (verified 11 Agu 2026)", () => {
  it("has exactly 6 units", () => {
    expect(ECOSYSTEM_UNITS).toHaveLength(6);
  });

  it("has exactly 25 products across all units", () => {
    expect(ECOSYSTEM_PRODUCTS).toHaveLength(25);
  });

  it("every grouped product is unique (no product listed under two units)", () => {
    expect(new Set(ECOSYSTEM_PRODUCTS).size).toBe(25);
  });

  it("each unit key maps to a non-empty product list", () => {
    for (const u of ECOSYSTEM_UNITS) {
      expect(ECOSYSTEM_PRODUCTS_BY_UNIT[u].length).toBeGreaterThan(0);
    }
  });

  it("does NOT reuse master_customer's 20fit_data unit — has event + membership instead", () => {
    expect(isEcosystemUnit("event")).toBe(true);
    expect(isEcosystemUnit("membership")).toBe(true);
    expect(isEcosystemUnit("20fit_data")).toBe(false);
  });

  it("isEcosystemUnit / isEcosystemProduct reject unknown and non-string input", () => {
    expect(isEcosystemUnit("arena")).toBe(true);
    expect(isEcosystemUnit("nope")).toBe(false);
    expect(isEcosystemUnit(7)).toBe(false);
    expect(isEcosystemProduct("Fitco User")).toBe(true);
    expect(isEcosystemProduct("Transaksi Arena")).toBe(true);
    expect(isEcosystemProduct("Ghost Product")).toBe(false);
    expect(isEcosystemProduct(null)).toBe(false);
  });
});
