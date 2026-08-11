import { describe, it, expect } from "vitest";
import { formatDisplayName, nameHasDigit, nameNeedsTidy } from "./display-name";

describe("formatDisplayName", () => {
  it("fixes all-lower and all-upper", () => {
    expect(formatDisplayName("budi santoso")).toBe("Budi Santoso");
    expect(formatDisplayName("BUDI SANTOSO")).toBe("Budi Santoso");
  });

  it("keeps initials uppercase (A.M. not A.m.)", () => {
    expect(formatDisplayName("a.m. rizki")).toBe("A.M. Rizki");
    expect(formatDisplayName("A.M. RIZKI")).toBe("A.M. Rizki");
  });

  it("capitalises both sides of a hyphen and apostrophe", () => {
    expect(formatDisplayName("nur-aini")).toBe("Nur-Aini");
    expect(formatDisplayName("d'souza")).toBe("D'Souza");
  });

  it("keeps particles lowercase between names, but capitalises a leading one", () => {
    expect(formatDisplayName("muhammad bin abdullah")).toBe("Muhammad bin Abdullah");
    expect(formatDisplayName("siti binti hasan")).toBe("Siti binti Hasan");
    expect(formatDisplayName("de rizki")).toBe("De Rizki"); // leading particle capitalised
  });

  it("keeps medical dr. lowercase but capitalises other titles", () => {
    expect(formatDisplayName("dr. andi")).toBe("dr. Andi");
    expect(formatDisplayName("DR. ANDI")).toBe("dr. Andi");
    expect(formatDisplayName("h. budi")).toBe("H. Budi");
    expect(formatDisplayName("hj. siti")).toBe("Hj. Siti");
    expect(formatDisplayName("drs. bambang")).toBe("Drs. Bambang");
    expect(formatDisplayName("ir. joko")).toBe("Ir. Joko");
    expect(formatDisplayName("s.pd budi")).toBe("S.Pd Budi");
    expect(formatDisplayName("m.m. rina")).toBe("M.M. Rina");
  });

  it("collapses doubled and edge whitespace", () => {
    expect(formatDisplayName("  budi   santoso  ")).toBe("Budi Santoso");
  });

  it("tidies (does not drop) names with digits — flagging is /quality's job", () => {
    expect(formatDisplayName("budi 123")).toBe("Budi 123");
    expect(formatDisplayName("agent007 smith")).toBe("Agent007 Smith");
  });

  it("returns null for null/blank", () => {
    expect(formatDisplayName(null)).toBeNull();
    expect(formatDisplayName("   ")).toBeNull();
  });

  it("is idempotent on already-tidy names", () => {
    expect(formatDisplayName("Budi Santoso")).toBe("Budi Santoso");
    expect(formatDisplayName("A.M. Rizki")).toBe("A.M. Rizki");
  });
});

describe("nameHasDigit", () => {
  it("detects digits, ignores clean names", () => {
    expect(nameHasDigit("budi 123")).toBe(true);
    expect(nameHasDigit("Budi Santoso")).toBe(false);
    expect(nameHasDigit(null)).toBe(false);
  });
});

describe("nameNeedsTidy", () => {
  it("is true only when tidying changes the string", () => {
    expect(nameNeedsTidy("budi santoso")).toBe(true);
    expect(nameNeedsTidy("Budi Santoso")).toBe(false);
    expect(nameNeedsTidy(null)).toBe(false);
  });
});
