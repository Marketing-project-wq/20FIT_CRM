import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhoneID } from "./normalize";

describe("normalizePhoneID — Indonesian format variants converge to one canonical", () => {
  // Canon is `62…` WITHOUT a plus, to match master_customer.phone_normalized
  // (verified 2026-08-11: 0 rows begin with `+`).
  const CANON = "628123456789";

  // Every one of these is the SAME number written differently. If any one of them
  // fails to converge, suppression matching fails silently (D-2).
  const variants = [
    "08123456789", // trunk 0
    "+628123456789", // full international with +
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

  // This test locks the REASON, not just the value. The canonical form MUST match
  // master_customer.phone_normalized (`62…`, never `+62…`). If someone "restores" the
  // plus, suppression keys stop matching the stored data and a person who asked to
  // stop being contacted keeps getting messaged — with no error anywhere. That is the
  // failure this test exists to prevent.
  it("canonical form must match master_customer (62…, never +62…) or suppression misses silently", () => {
    for (const v of ["+628123456789", "08123456789", "628123456789", "0062 812 3456 789"]) {
      const out = normalizePhoneID(v);
      expect(out).not.toBeNull();
      expect(out!.startsWith("+")).toBe(false); // a leading + would break suppression matching
      expect(out!.startsWith("62")).toBe(true); // must carry the 62 country code, plain
    }
  });

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
