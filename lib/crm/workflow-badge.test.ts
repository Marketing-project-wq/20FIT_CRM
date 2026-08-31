import { describe, it, expect } from "vitest";
import { workflowStatusBadge } from "./workflow-badge";

/**
 * Locks the badge to is_active (T-38 follow-up). If someone ever inverts the badge or hard-codes it,
 * this fails — the screen must never claim a workflow is Active when the data says it is paused.
 */
describe("workflowStatusBadge follows is_active", () => {
  it("active → green + statusActive", () => {
    expect(workflowStatusBadge(true)).toEqual({ tone: "green", key: "statusActive" });
  });
  it("inactive → neutral + statusPaused", () => {
    expect(workflowStatusBadge(false)).toEqual({ tone: "neutral", key: "statusPaused" });
  });
});
