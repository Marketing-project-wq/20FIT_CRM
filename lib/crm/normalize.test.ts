import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhoneID } from "./normalize";

describe("normalizePhoneID — Indonesian format variants converge to one canonical", () => {
  const CANON = "+628123456789";

  // Every one of these is the SAME number written differently. If any one of them
  // fails to converge, suppression matching fails silently (D-2).
  const variants = [
    "08123456789", // trunk 0
    "+628123456789", // full international
    "628123456789", // 62 without +
    "8123456789", // national, no prefix
    "0812-3456-789", // dashes
    "0812 3456 789", // spaces
    "  08123456789  ", // surrounding whitespace
    "(0812) 3456-789", // parentheses + dash
    "0062 812 3456 789", // 00 international prefix
  ];
  for (const v of variants) {
    it(`"${v}" -> ${CANON}`, () => {
      expect(normalizePhoneID(v)).toBe(CANON);
    });
  }

  it("rejects empty / non-numeric / null / prefix-only", () => {
    expect(normalizePhoneID("")).toBeNull();
    expect(normalizePhoneID("   ")).toBeNull();
    expect(normalizePhoneID("abc")).toBeNull();
    expect(normalizePhoneID(null)).toBeNull();
    expect(normalizePhoneID(undefined)).toBeNull();
    expect(normalizePhoneID("62")).toBeNull();
    expect(normalizePhoneID("0")).toBeNull();
  });

  it("distinct numbers do NOT collide", () => {
    expect(normalizePhoneID("08123456789")).not.toBe(normalizePhoneID("08123456780"));
  });
});

describe("normalizeEmail — trim + lowercase", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["User@Example.COM", "user@example.com"],
    ["  user@example.com  ", "user@example.com"],
    ["ADMIN@20FIT.ID", "admin@20fit.id"],
    ["Marketing@20fit.id", "marketing@20fit.id"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" -> ${expected}`, () => {
      expect(normalizeEmail(input)).toBe(expected);
    });
  }

  it("rejects blanks / non-emails / null", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});
