import { describe, it, expect } from "vitest";
import { SEND_ACTION } from "./send-constants";
import { EXPORT_ACTION } from "./export-constants";
import { classifyAction } from "./retention-policy";

/**
 * PARITY: the send audit action must classify as COMPLIANCE (retained permanently) via an EXISTING
 * prefix — never land in `other` (the "new action between the two lists" trap, now on its 6th
 * possible occurrence). This test uses the EXACT string the send code writes (SEND_ACTION), so a
 * rename that broke the classification would fail here.
 */
describe("send audit action ⇄ retention classification", () => {
  it("SEND_ACTION classifies as compliance (permanent), never 'other'", () => {
    expect(classifyAction(SEND_ACTION)).toBe("compliance");
    expect(classifyAction(SEND_ACTION)).not.toBe("other");
  });

  it("reuses the existing export. prefix (same family as export.performed), not a new one", () => {
    expect(SEND_ACTION.startsWith("export.")).toBe(true);
    expect(EXPORT_ACTION.startsWith("export.")).toBe(true);
    // Same retention class as the established export action — outbound data, kept as evidence.
    expect(classifyAction(SEND_ACTION)).toBe(classifyAction(EXPORT_ACTION));
  });
});
