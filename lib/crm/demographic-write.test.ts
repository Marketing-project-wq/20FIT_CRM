import { describe, it, expect } from "vitest";
import { isIsoDate, isGender } from "./demographic-pick";

describe("demographic write validators (route input hardening)", () => {
  it("isGender accepts exactly male/female", () => {
    expect(isGender("male")).toBe(true);
    expect(isGender("female")).toBe(true);
    expect(isGender("Male")).toBe(false);
    expect(isGender("laki-laki")).toBe(false); // the API takes the coded value, not free text
    expect(isGender(null)).toBe(false);
    expect(isGender(1)).toBe(false);
  });

  it("isIsoDate accepts real yyyy-mm-dd dates only", () => {
    expect(isIsoDate("1990-05-12")).toBe(true);
    expect(isIsoDate("1988-02-29")).toBe(true); // 1988 IS a leap year → 29 Feb valid
    expect(isIsoDate("1989-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("1990-13-01")).toBe(false); // bad month
    expect(isIsoDate("1990-00-10")).toBe(false); // month 0
    expect(isIsoDate("1990-05-32")).toBe(false); // bad day
    expect(isIsoDate("12/05/1990")).toBe(false); // wrong format
    expect(isIsoDate("1990-5-2")).toBe(false); // unpadded
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate(19900512)).toBe(false);
  });

  it("1988-02-29 (leap) is valid; the assertion above documents the leap-year check", () => {
    expect(isIsoDate("2000-02-29")).toBe(true); // divisible by 400
    expect(isIsoDate("1900-02-29")).toBe(false); // divisible by 100 not 400 → not leap
  });
});
