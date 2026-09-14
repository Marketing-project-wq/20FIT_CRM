import { describe, expect, it } from "vitest";
import { correctEmailDomain, correctEmailDomainWithLog, DOMAIN_CORRECTIONS } from "./email-domain-correct";

describe("correctEmailDomain", () => {
  it("corrects all mapped gmail typos", () => {
    expect(correctEmailDomain("user@gmail.col")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmail.con")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmail.co")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmail.cim")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmail.vom")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmial.com")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmai.com")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmal.com")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gnail.com")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gmaol.com")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@gamil.com")).toBe("user@gmail.com");
  });

  it("corrects all mapped yahoo typos", () => {
    expect(correctEmailDomain("user@yahoo.con")).toBe("user@yahoo.com");
    expect(correctEmailDomain("user@yahoo.col")).toBe("user@yahoo.com");
    expect(correctEmailDomain("user@yaboo.com")).toBe("user@yahoo.com");
    expect(correctEmailDomain("user@yahooo.com")).toBe("user@yahoo.com");
    expect(correctEmailDomain("user@yaho.com")).toBe("user@yahoo.com");
  });

  it("corrects all mapped hotmail typos", () => {
    expect(correctEmailDomain("user@hotmail.con")).toBe("user@hotmail.com");
    expect(correctEmailDomain("user@hmail.com")).toBe("user@hotmail.com");
    expect(correctEmailDomain("user@hotmial.com")).toBe("user@hotmail.com");
    expect(correctEmailDomain("user@hotmai.com")).toBe("user@hotmail.com");
  });

  it("corrects all mapped outlook typos", () => {
    expect(correctEmailDomain("user@outlok.com")).toBe("user@outlook.com");
    expect(correctEmailDomain("user@outloo.com")).toBe("user@outlook.com");
  });

  it("does not change valid domains", () => {
    expect(correctEmailDomain("user@gmail.com")).toBe("user@gmail.com");
    expect(correctEmailDomain("user@yahoo.com")).toBe("user@yahoo.com");
    expect(correctEmailDomain("user@hotmail.com")).toBe("user@hotmail.com");
    expect(correctEmailDomain("user@outlook.com")).toBe("user@outlook.com");
    expect(correctEmailDomain("user@company.co.id")).toBe("user@company.co.id");
    expect(correctEmailDomain("admin@internal.local")).toBe("admin@internal.local");
  });

  it("handles uppercase input", () => {
    expect(correctEmailDomain("User@GMAIL.CON")).toBe("user@gmail.com");
    expect(correctEmailDomain("USER@Gmai.Com")).toBe("user@gmail.com");
  });

  it("handles whitespace", () => {
    expect(correctEmailDomain("  user@gmail.con  ")).toBe("user@gmail.com");
  });

  it("returns empty/invalid input as-is", () => {
    expect(correctEmailDomain("")).toBe("");
    expect(correctEmailDomain("noemail")).toBe("noemail");
  });

  it("handles email without valid @ position", () => {
    expect(correctEmailDomain("@gmail.con")).toBe("@gmail.con");
    expect(correctEmailDomain("user@")).toBe("user@");
  });
});

describe("correctEmailDomainWithLog", () => {
  it("returns corrected flag and domains when correction happens", () => {
    const result = correctEmailDomainWithLog("user@gmail.con");
    expect(result.corrected).toBe(true);
    expect(result.email).toBe("user@gmail.com");
    expect(result.originalDomain).toBe("gmail.con");
    expect(result.correctedDomain).toBe("gmail.com");
  });

  it("returns corrected=false for valid domains", () => {
    const result = correctEmailDomainWithLog("user@gmail.com");
    expect(result.corrected).toBe(false);
    expect(result.email).toBe("user@gmail.com");
    expect(result.originalDomain).toBe("gmail.com");
    expect(result.correctedDomain).toBeNull();
  });

  it("handles empty input", () => {
    const result = correctEmailDomainWithLog("");
    expect(result.corrected).toBe(false);
    expect(result.email).toBe("");
  });

  it("handles input without @", () => {
    const result = correctEmailDomainWithLog("noemail");
    expect(result.corrected).toBe(false);
    expect(result.originalDomain).toBeNull();
  });
});

describe("DOMAIN_CORRECTIONS mapping completeness", () => {
  it("covers all required typo domains from the spec", () => {
    const required = [
      "gmail.col", "gmail.con", "gmail.co", "gmail.cim", "gmail.vom",
      "gmial.com", "gmai.com", "gmal.com", "gnail.com",
      "yahoo.con", "yahoo.col", "yaboo.com", "yahooo.com",
      "hotmail.con", "hmail.com",
      "outlok.com", "outloo.com",
    ];
    for (const domain of required) {
      expect(DOMAIN_CORRECTIONS[domain]).toBeDefined();
    }
  });
});
