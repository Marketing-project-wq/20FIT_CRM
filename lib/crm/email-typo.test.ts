import { describe, it, expect } from "vitest";
import {
  detectEmailTypo,
  emailDomain,
  boundedEditDistance,
  KNOWN_TYPO_DOMAINS,
} from "./email-typo";

describe("emailDomain", () => {
  it("extracts and lowercases the domain", () => {
    expect(emailDomain("Budi@Gmail.com")).toBe("gmail.com");
    expect(emailDomain("  a@b.co  ")).toBe("b.co");
  });
  it("rejects non-emails", () => {
    expect(emailDomain("notanemail")).toBeNull();
    expect(emailDomain("@nolocal.com")).toBeNull();
    expect(emailDomain("trailing@")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe("boundedEditDistance", () => {
  it("returns real distance within the bound", () => {
    expect(boundedEditDistance("gmail.com", "gmail.com", 1)).toBe(0);
    expect(boundedEditDistance("gmai.com", "gmail.com", 1)).toBe(1);
  });
  it("short-circuits above the bound", () => {
    expect(boundedEditDistance("gmail.co.uk", "gmail.com", 1)).toBeGreaterThan(1);
  });
});

describe("detectEmailTypo", () => {
  it("flags the systematic gmaol.com as high confidence → gmail.com", () => {
    const r = detectEmailTypo("budi@gmaol.com");
    expect(r.suspect).toBe(true);
    expect(r.suggestion).toBe("gmail.com");
    expect(r.confidence).toBe("high");
  });

  it("flags other known typos high", () => {
    for (const bad of Object.keys(KNOWN_TYPO_DOMAINS)) {
      const r = detectEmailTypo(`x@${bad}`);
      expect(r.suspect).toBe(true);
      expect(r.confidence).toBe("high");
    }
  });

  it("flags an unknown edit-distance-1 domain as medium", () => {
    // 'gmail.cim' is not in the known list but is one edit from gmail.com
    const r = detectEmailTypo("x@gmail.cim");
    expect(r.suspect).toBe(true);
    expect(r.suggestion).toBe("gmail.com");
    expect(r.confidence).toBe("medium");
  });

  it("does NOT flag legitimate lookalikes (gmail.co.uk, yahoo.co.id)", () => {
    expect(detectEmailTypo("x@gmail.co.uk").suspect).toBe(false);
    expect(detectEmailTypo("x@yahoo.co.id").suspect).toBe(false);
  });

  it("does NOT flag a clean common domain or an unrelated domain", () => {
    expect(detectEmailTypo("x@gmail.com").suspect).toBe(false);
    expect(detectEmailTypo("x@company.co.id").suspect).toBe(false);
  });

  it("returns not-suspect for non-emails", () => {
    expect(detectEmailTypo("garbage").suspect).toBe(false);
    expect(detectEmailTypo(null).suspect).toBe(false);
  });
});
