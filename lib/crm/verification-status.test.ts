import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyScreen, computeVerificationStatus, SCREENS } from "./verification-status";

describe("classifyScreen (pure rule)", () => {
  it("auditable + rows -> proven", () => {
    expect(classifyScreen("auditable", 1)).toBe("proven");
    expect(classifyScreen("auditable", 99)).toBe("proven");
  });
  it("auditable + zero -> unproven", () => {
    expect(classifyScreen("auditable", 0)).toBe("unproven");
  });
  it("not_auditable ALWAYS -> not_auditable (zero rows is correct, not missing proof)", () => {
    expect(classifyScreen("not_auditable", 0)).toBe("not_auditable");
    // even if some row somehow matched, the kind decides — never collapses into unproven
    expect(classifyScreen("not_auditable", 5)).toBe("not_auditable");
  });
});

/** Minimal spy returning a fixed row set for the single crm_audit_log SELECT. */
function spyWithRows(rows: unknown[]) {
  const builder = {
    select() { return this; },
    order() { return this; },
    limit() { return this; },
    then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder } as any;
}

describe("computeVerificationStatus (derived from audit rows)", () => {
  it("classifies the three categories from real-shaped rows", async () => {
    const rows = [
      { action: "list.viewed", target_table: "master_customer", actor_email: "tifany@20fit.id", occurred_at: "2026-08-11T13:39:03Z" },
      { action: "profile.viewed", target_table: "master_customer", actor_email: "tifany@20fit.id", occurred_at: "2026-08-11T13:38:31Z" },
      { action: "search.performed", target_table: "master_customer", actor_email: "tifany@20fit.id", occurred_at: "2026-08-11T13:39:19Z" },
      { action: "list.viewed", target_table: "crm_consent", actor_email: "tifany@20fit.id", occurred_at: "2026-08-11T09:04:13Z" },
      { action: "list.viewed", target_table: "crm_audit_log", actor_email: "tifany@20fit.id", occurred_at: "2026-08-11T09:05:18Z" },
    ];
    const statuses = await computeVerificationStatus(spyWithRows(rows));
    const by = Object.fromEntries(statuses.map((s) => [s.key, s]));

    expect(by.audience_list.status).toBe("proven");
    expect(by.profile_detail.status).toBe("proven"); // V-6 closed by id=51 in production
    expect(by.search.status).toBe("proven");
    expect(by.consent.status).toBe("proven");
    expect(by.audit_screen.status).toBe("proven");
    // The third category — NOT collapsed into unproven.
    expect(by.dashboard.status).toBe("not_auditable");
    expect(by.quality.status).toBe("not_auditable");
    expect(by.dashboard.onlyEvidence).toMatch(/Railway|mata/);
  });

  it("a route that writes audit but has no row yet -> unproven (not not_auditable)", async () => {
    // No profile.viewed / search rows present.
    const rows = [
      { action: "list.viewed", target_table: "master_customer", actor_email: "x@20fit.id", occurred_at: "2026-08-11T13:39:03Z" },
    ];
    const by = Object.fromEntries((await computeVerificationStatus(spyWithRows(rows))).map((s) => [s.key, s]));
    expect(by.profile_detail.status).toBe("unproven");
    expect(by.search.status).toBe("unproven");
    // still distinct from the deliberately-unaudited screens
    expect(by.quality.status).toBe("not_auditable");
  });

  it("carries last-evidence time + staff actor so 'proven' isn't 'once, months ago'", async () => {
    const rows = [
      { action: "list.viewed", target_table: "master_customer", actor_email: "tifany@20fit.id", occurred_at: "2026-08-11T13:39:03Z" },
    ];
    const by = Object.fromEntries((await computeVerificationStatus(spyWithRows(rows))).map((s) => [s.key, s]));
    expect(by.audience_list.lastAt).toBe("2026-08-11T13:39:03Z");
    expect(by.audience_list.lastActor).toBe("tifany@20fit.id");
  });

  it("registry has both categories and unique keys", () => {
    expect(SCREENS.some((s) => s.kind === "auditable")).toBe(true);
    expect(SCREENS.some((s) => s.kind === "not_auditable")).toBe(true);
    expect(new Set(SCREENS.map((s) => s.key)).size).toBe(SCREENS.length);
  });
});
