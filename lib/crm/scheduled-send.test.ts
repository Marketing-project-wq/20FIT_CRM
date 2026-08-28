import { describe, it, expect } from "vitest";
import { wibToUtcIso, WIB_OFFSET_HOURS } from "./wib-time";

describe("wibToUtcIso", () => {
  it("converts WIB wall clock to UTC (subtracts 7h)", () => {
    // 14:30 WIB on 2026-08-29 = 07:30 UTC same day.
    expect(wibToUtcIso("2026-08-29", "14:30")).toBe("2026-08-29T07:30:00.000Z");
  });
  it("rolls back to the previous UTC day when WIB time < 07:00", () => {
    // 03:00 WIB = 20:00 UTC the day before.
    expect(wibToUtcIso("2026-08-29", "03:00")).toBe("2026-08-28T20:00:00.000Z");
  });
  it("midnight WIB = 17:00 UTC prev day", () => {
    expect(wibToUtcIso("2026-01-01", "00:00")).toBe("2025-12-31T17:00:00.000Z");
  });
  it("rejects malformed date/time", () => {
    expect(wibToUtcIso("2026/08/29", "14:30")).toBeNull();
    expect(wibToUtcIso("2026-08-29", "25:00")).toBeNull();
    expect(wibToUtcIso("", "")).toBeNull();
  });
  it("offset constant is +7", () => {
    expect(WIB_OFFSET_HOURS).toBe(7);
  });
});
