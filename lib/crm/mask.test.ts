import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail } from "./mask";

describe("maskPhone", () => {
  it("matches the PRD 17.1 example shape", () => {
    expect(maskPhone("+6281234568953")).toBe("62812****8953");
  });
  it("handles a value with no leading +", () => {
    expect(maskPhone("6281234568953")).toBe("62812****8953");
  });
  it("never reveals a head+tail when too short to do so safely", () => {
    expect(maskPhone("+6281")).toBe("****");
    expect(maskPhone("12345678")).toBe("****"); // 8 digits < 9
  });
  it("returns null for empty / null", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone("")).toBeNull();
    expect(maskPhone("+")).toBeNull();
  });
});

describe("maskEmail", () => {
  it("matches the PRD 17.1 example shape", () => {
    expect(maskEmail("john@domain.com")).toBe("j***@domain.com");
  });
  it("masks a single-char local part", () => {
    expect(maskEmail("a@x.co")).toBe("a***@x.co");
  });
  it("reveals nothing when there is no usable local part", () => {
    expect(maskEmail("@domain.com")).toBe("***");
    expect(maskEmail("notanemail")).toBe("***");
  });
  it("returns null for empty / null", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
    expect(maskEmail("")).toBeNull();
  });
});
