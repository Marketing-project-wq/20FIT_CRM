import { describe, it, expect } from "vitest";
import {
  isIdentityKind,
  isOfferedReason,
  prepareIdentity,
  clampDetail,
  RECORD_REASONS,
  REASON_DETAIL_MAX,
} from "./suppression-input";

describe("isIdentityKind", () => {
  it("accepts only phone/email", () => {
    expect(isIdentityKind("phone")).toBe(true);
    expect(isIdentityKind("email")).toBe(true);
    expect(isIdentityKind("sms")).toBe(false);
    expect(isIdentityKind(null)).toBe(false);
    expect(isIdentityKind(undefined)).toBe(false);
  });
});

describe("isOfferedReason", () => {
  it("accepts the four offered reasons", () => {
    for (const r of RECORD_REASONS) expect(isOfferedReason(r.value)).toBe(true);
  });
  it("rejects legacy_import (valid in DB, NOT offered by the app — no backfill)", () => {
    expect(isOfferedReason("legacy_import")).toBe(false);
  });
  it("rejects anything else", () => {
    expect(isOfferedReason("whatever")).toBe(false);
    expect(isOfferedReason(null)).toBe(false);
  });
});

describe("prepareIdentity — the first runtime consumer of normalize.ts", () => {
  it("normalizes a trunk-0 phone to 62… canon (no +)", () => {
    const r = prepareIdentity("phone", "0812-3456-789");
    expect(r).toEqual({ ok: true, identityKind: "phone", identityKey: "628123456789" });
  });
  it("normalizes a +62 phone to 62… canon (strips the +)", () => {
    const r = prepareIdentity("phone", "+62 812 3456 789");
    expect(r.ok && r.identityKey).toBe("628123456789");
  });
  it("lowercases an email", () => {
    const r = prepareIdentity("email", "  John.Doe@Example.COM ");
    expect(r).toEqual({ ok: true, identityKind: "email", identityKey: "john.doe@example.com" });
  });
  it("rejects an un-normalizable phone (never stores raw)", () => {
    const r = prepareIdentity("phone", "not-a-number");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/62/);
  });
  it("rejects an email with no @", () => {
    const r = prepareIdentity("email", "nodomain");
    expect(r.ok).toBe(false);
  });
  it("rejects null / empty", () => {
    expect(prepareIdentity("phone", null).ok).toBe(false);
    expect(prepareIdentity("email", "").ok).toBe(false);
  });
});

describe("clampDetail", () => {
  it("trims and returns null for empty/whitespace", () => {
    expect(clampDetail("   ", REASON_DETAIL_MAX)).toBeNull();
    expect(clampDetail(null, REASON_DETAIL_MAX)).toBeNull();
    expect(clampDetail(undefined, REASON_DETAIL_MAX)).toBeNull();
  });
  it("caps to the max length", () => {
    const long = "a".repeat(REASON_DETAIL_MAX + 50);
    expect(clampDetail(long, REASON_DETAIL_MAX)?.length).toBe(REASON_DETAIL_MAX);
  });
  it("keeps a normal short note", () => {
    expect(clampDetail("  minta stop lewat WA  ", REASON_DETAIL_MAX)).toBe("minta stop lewat WA");
  });
});
