import { describe, it, expect } from "vitest";
import { SEND_ACTION } from "./send-constants";
import { EXPORT_ACTION } from "./export-constants";
import { classifyAction } from "./retention-policy";

/**
 * PARITY: the send audit action must classify as COMPLIANCE (retained permanently) — never land in
 * `other` (the "new action between the two lists" trap). It gets its OWN family `campaign.` (K-39),
 * added to the purge denylist the K-09 way, NOT reused from `export.` — sending is not exporting.
 * This uses the EXACT string the send code writes (SEND_ACTION), so a rename that broke the
 * classification would fail here.
 */
describe("send audit action ⇄ retention classification", () => {
  it("SEND_ACTION classifies as compliance (permanent), never 'other'", () => {
    expect(classifyAction(SEND_ACTION)).toBe("compliance");
    expect(classifyAction(SEND_ACTION)).not.toBe("other");
  });

  it("uses its OWN campaign. family — a send is not an export", () => {
    expect(SEND_ACTION.startsWith("campaign.")).toBe(true);
    expect(SEND_ACTION.startsWith("export.")).toBe(false);
  });

  it("is retained like exports are, but under a distinct family (same class, different meaning)", () => {
    // Same retention CLASS as export.performed (both compliance/permanent)…
    expect(classifyAction(SEND_ACTION)).toBe(classifyAction(EXPORT_ACTION));
    // …but a DIFFERENT family, so an audit filter for exports never surfaces a campaign send.
    expect(SEND_ACTION.split(".")[0]).not.toBe(EXPORT_ACTION.split(".")[0]);
  });
});
