import { describe, it, expect } from "vitest";
import { validateCampaignName, decideRunLabel, CAMPAIGN_NAME_MAX } from "./campaign-name";

describe("validateCampaignName", () => {
  it("accepts a normal name and returns the trimmed value", () => {
    expect(validateCampaignName("  Newsletter Sept #1  ")).toEqual({ ok: true, value: "Newsletter Sept #1" });
  });

  it("rejects an empty string as required", () => {
    expect(validateCampaignName("")).toEqual({ ok: false, error: "required" });
  });

  it("treats whitespace-only as required (empty), not too_short", () => {
    expect(validateCampaignName("   ")).toEqual({ ok: false, error: "required" });
  });

  it("rejects null/undefined as required", () => {
    expect(validateCampaignName(null)).toEqual({ ok: false, error: "required" });
    expect(validateCampaignName(undefined)).toEqual({ ok: false, error: "required" });
  });

  it("rejects a name shorter than 3 chars (after trim)", () => {
    expect(validateCampaignName("ab")).toEqual({ ok: false, error: "too_short" });
    expect(validateCampaignName(" a ")).toEqual({ ok: false, error: "too_short" });
  });

  it("accepts exactly 3 chars", () => {
    expect(validateCampaignName("abc")).toEqual({ ok: true, value: "abc" });
  });

  it("accepts exactly the max length and rejects one over", () => {
    const max = "x".repeat(CAMPAIGN_NAME_MAX);
    expect(validateCampaignName(max)).toEqual({ ok: true, value: max });
    expect(validateCampaignName("x".repeat(CAMPAIGN_NAME_MAX + 1))).toEqual({ ok: false, error: "too_long" });
  });
});

describe("decideRunLabel (server run-label policy)", () => {
  it("REJECTS a new run with no label (what the server enforces)", () => {
    expect(decideRunLabel({ kind: "new", label: null })).toEqual({ ok: false, error: "required" });
    expect(decideRunLabel({ kind: "new", label: "   " })).toEqual({ ok: false, error: "required" });
    expect(decideRunLabel({ kind: "new", label: "ab" })).toEqual({ ok: false, error: "too_short" });
  });

  it("accepts a new run with a valid label and returns the trimmed value", () => {
    expect(decideRunLabel({ kind: "new", label: "  Sept blast  " })).toEqual({ ok: true, label: "Sept blast" });
  });

  it("does NOT validate a resume run — it keeps the existing run's name (label null)", () => {
    expect(decideRunLabel({ kind: "resume" })).toEqual({ ok: true, label: null });
  });
});
