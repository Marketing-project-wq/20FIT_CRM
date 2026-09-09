import { describe, it, expect } from "vitest";
import { cleanSenderName, validateSenderName, senderNameForWire, MAX_SENDER_NAME } from "./sender-name";

/**
 * The shared sender-name rule. cleanSenderName collapses whitespace/newlines; validateSenderName is
 * the route's reject-or-store gate; senderNameForWire is the wire's last-resort clean+clamp. All three
 * agree by construction (one module) — the T-74 lesson.
 */
describe("cleanSenderName", () => {
  it("collapses newlines, tabs and repeated spaces to a single space, and trims", () => {
    expect(cleanSenderName("  20FIT   Studio\nKemang\t ")).toBe("20FIT Studio Kemang");
  });
  it("returns '' for null/undefined/blank", () => {
    expect(cleanSenderName(null)).toBe("");
    expect(cleanSenderName(undefined)).toBe("");
    expect(cleanSenderName("   \n\t ")).toBe("");
  });
});

describe("validateSenderName (route gate)", () => {
  it("empty → ok with null (send falls back to the client default, never an error)", () => {
    expect(validateSenderName("")).toEqual({ ok: true, value: null });
    expect(validateSenderName("   ")).toEqual({ ok: true, value: null });
  });
  it("a normal name → ok with the cleaned value", () => {
    expect(validateSenderName("  20FIT  Studio ")).toEqual({ ok: true, value: "20FIT Studio" });
  });
  it("accepts a name exactly at the cap", () => {
    const atCap = "a".repeat(MAX_SENDER_NAME);
    expect(validateSenderName(atCap)).toEqual({ ok: true, value: atCap });
  });
  it("REJECTS a name past the cap (measured in code points, so it can't be smuggled past with padding)", () => {
    expect(validateSenderName("a".repeat(MAX_SENDER_NAME + 1))).toEqual({ ok: false, error: "too_long" });
    // Whitespace padding is collapsed BEFORE the length check, so it can't inflate the count.
    expect(validateSenderName(`${"a".repeat(MAX_SENDER_NAME)}   `)).toEqual({ ok: true, value: "a".repeat(MAX_SENDER_NAME) });
  });
});

describe("senderNameForWire (last-resort clamp at the wire)", () => {
  it("cleans and passes a normal name through", () => {
    expect(senderNameForWire("20FIT\nStudio")).toBe("20FIT Studio");
  });
  it("falls back to 20FIT CRM when empty (the reset-path default)", () => {
    expect(senderNameForWire(null)).toBe("20FIT CRM");
    expect(senderNameForWire("  ")).toBe("20FIT CRM");
  });
  it("hard-clamps an over-length legacy value to the cap (never sends a broken/unbounded name)", () => {
    expect(Array.from(senderNameForWire("b".repeat(500))).length).toBe(MAX_SENDER_NAME);
  });
});
