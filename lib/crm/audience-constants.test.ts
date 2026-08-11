import { describe, it, expect } from "vitest";
import { capFilterValue, FILTER_VALUE_MAX } from "./audience-constants";

describe("capFilterValue (audit filter length cap)", () => {
  it("passes a value shorter than the cap unchanged, with its real length", () => {
    expect(capFilterValue("jakarta")).toEqual({ value: "jakarta", length: 7 });
  });

  it("keeps a value exactly at the cap (60) whole", () => {
    const s = "a".repeat(60);
    expect(capFilterValue(s)).toEqual({ value: s, length: 60 });
  });

  it("truncates at 61 to 60 chars but records the ORIGINAL length", () => {
    const s = "a".repeat(61);
    const out = capFilterValue(s);
    expect(out.value).toHaveLength(60);
    expect(out.length).toBe(61); // original length preserved so truncation is visible
  });

  it("treats empty string as an empty value (length 0)", () => {
    expect(capFilterValue("")).toEqual({ value: "", length: 0 });
  });

  it("treats null / undefined as no value", () => {
    expect(capFilterValue(null)).toEqual({ value: null, length: 0 });
    expect(capFilterValue(undefined)).toEqual({ value: null, length: 0 });
  });

  it("caps by UTF-16 code units and never exceeds the cap, keeping original length", () => {
    // 40 emoji = 80 UTF-16 code units; the cap must bound the stored value at 60 units
    // while `length` reports the original 80 (documenting code-unit semantics).
    const s = "😀".repeat(40);
    const out = capFilterValue(s);
    expect(s.length).toBe(80);
    expect(out.length).toBe(80);
    expect(out.value!.length).toBeLessThanOrEqual(60);
  });

  it("honors a custom cap", () => {
    expect(capFilterValue("abcdef", 3)).toEqual({ value: "abc", length: 6 });
  });

  it("exports the documented default cap", () => {
    expect(FILTER_VALUE_MAX).toBe(60);
  });
});
