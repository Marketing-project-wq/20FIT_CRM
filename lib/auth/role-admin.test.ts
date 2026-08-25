import { describe, it, expect } from "vitest";
import { evaluateGrant, evaluateRevoke, type RoleState } from "./role-admin";

/**
 * The biting rules of role administration (FINAL TUGAS 4). These are the guards that a hidden UI
 * control cannot provide — they must hold in the pure decision layer so the server action is a thin
 * wrapper over proven logic.
 */

const base: RoleState = {
  actorUserId: "actor",
  targetUserId: "other",
  targetCurrentRole: "viewer",
  superAdminCount: 2,
};

describe("evaluateGrant — add / change", () => {
  it("allows promoting another user to any known role", () => {
    expect(evaluateGrant("crm_manager", base)).toBeNull();
    expect(evaluateGrant("super_admin", base)).toBeNull();
  });

  it("rejects an unknown role", () => {
    expect(evaluateGrant("wizard", base)).toBe("bad_role");
    expect(evaluateGrant("", base)).toBe("bad_role");
  });

  it("blocks a Super Admin from demoting THEMSELVES", () => {
    const s: RoleState = { ...base, targetUserId: "actor", targetCurrentRole: "super_admin", superAdminCount: 3 };
    expect(evaluateGrant("crm_manager", s)).toBe("self_demote");
    expect(evaluateGrant("viewer", s)).toBe("self_demote");
  });

  it("allows a Super Admin to re-grant themselves super_admin (no-op)", () => {
    const s: RoleState = { ...base, targetUserId: "actor", targetCurrentRole: "super_admin", superAdminCount: 3 };
    expect(evaluateGrant("super_admin", s)).toBeNull();
  });

  it("blocks demoting the LAST Super Admin (someone else, only one left)", () => {
    const s: RoleState = { ...base, targetUserId: "other", targetCurrentRole: "super_admin", superAdminCount: 1 };
    expect(evaluateGrant("crm_manager", s)).toBe("last_super_admin");
  });

  it("allows demoting a Super Admin when others remain", () => {
    const s: RoleState = { ...base, targetUserId: "other", targetCurrentRole: "super_admin", superAdminCount: 2 };
    expect(evaluateGrant("crm_manager", s)).toBeNull();
  });

  it("allows changing a non-super-admin freely", () => {
    expect(evaluateGrant("analyst", { ...base, targetCurrentRole: "crm_manager" })).toBeNull();
  });
});

describe("evaluateRevoke — remove", () => {
  it("allows revoking another user's non-super-admin role", () => {
    expect(evaluateRevoke(base)).toBeNull();
  });

  it("rejects revoking a user who has no role", () => {
    expect(evaluateRevoke({ ...base, targetCurrentRole: null })).toBe("not_assigned");
  });

  it("blocks revoking YOURSELF", () => {
    expect(evaluateRevoke({ ...base, targetUserId: "actor", targetCurrentRole: "super_admin", superAdminCount: 3 })).toBe("self_demote");
    // even a non-super-admin self-revoke is blocked (defensive; a super_admin actor won't hold a lesser role)
    expect(evaluateRevoke({ ...base, targetUserId: "actor", targetCurrentRole: "viewer", superAdminCount: 3 })).toBe("self_demote");
  });

  it("blocks revoking the LAST Super Admin", () => {
    expect(evaluateRevoke({ ...base, targetUserId: "other", targetCurrentRole: "super_admin", superAdminCount: 1 })).toBe("last_super_admin");
  });

  it("allows revoking a Super Admin when others remain", () => {
    expect(evaluateRevoke({ ...base, targetUserId: "other", targetCurrentRole: "super_admin", superAdminCount: 2 })).toBeNull();
  });
});
