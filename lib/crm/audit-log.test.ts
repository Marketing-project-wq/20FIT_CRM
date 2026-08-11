import { describe, it, expect } from "vitest";
import { classifyAction, isArtifact } from "./audit-log-constants";

/**
 * classifyAction MUST mirror migration 8's purge allowlist exactly — this test is the
 * lock. If it fails, either the classifier drifted from the migration, or the
 * migration changed and this was not updated. Either way, the screen would lie about
 * which rows can disappear.
 */
describe("classifyAction mirrors migration 8", () => {
  it("operational = the exact purge allowlist", () => {
    expect(classifyAction("profile.viewed")).toBe("operational");
    expect(classifyAction("list.viewed")).toBe("operational");
    expect(classifyAction("search.executed")).toBe("operational");
    expect(classifyAction("login.success")).toBe("operational");
  });

  it("compliance = the permanently-excluded categories", () => {
    for (const a of [
      "consent.recorded",
      "suppression.added",
      "role.granted",
      "profile.deleted",
      "export.requested",
      "retention.purge_executed",
    ]) {
      expect(classifyAction(a)).toBe("compliance");
    }
  });

  it("anything not on the allowlist is 'other' (retained, not a compliance guarantee)", () => {
    expect(classifyAction("test.trigger_check")).toBe("other");
    expect(classifyAction("something.new")).toBe("other");
  });

  it("does not confuse a prefix lookalike (profile.deleted is compliance, profile.viewed is operational)", () => {
    expect(classifyAction("profile.viewed")).toBe("operational");
    expect(classifyAction("profile.deleted")).toBe("compliance");
  });
});

describe("artifact rows", () => {
  it("marks id 1 and 5, nothing else", () => {
    expect(isArtifact(1)).toBe(true);
    expect(isArtifact(5)).toBe(true);
    expect(isArtifact(2)).toBe(false);
    expect(isArtifact(6)).toBe(false);
  });
});
