import { describe, it, expect } from "vitest";
import {
  grantFor,
  resolveGrant,
  isPermitted,
  shouldMaskContact,
  canSeeNav,
  ROLES,
  ACTIONS,
  type Role,
  type Action,
  type Grant,
} from "./roles";

/**
 * This test IS the PRD 17.2 matrix in machine-checkable form. If a cell changes here
 * without a corresponding PRD change, that is the bug. Row order matches the PRD table.
 */
const PRD_17_2: Record<Action, Record<Role, Grant>> = {
  "profile.view_list": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "masked", data_steward: "allow",
  },
  "profile.view_contact": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "deny", data_steward: "allow",
  },
  "profile.view_health": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny",
  },
  "segment.build": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "allow", data_steward: "deny",
  },
  "export.at_or_below_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "approval",
    unit_manager: "approval", analyst: "deny", data_steward: "deny",
  },
  "export.above_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny",
  },
  "workflow.create": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "draft",
    unit_manager: "draft", analyst: "deny", data_steward: "deny",
  },
  "workflow.activate": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny",
  },
  "send.at_or_below_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "deny", data_steward: "deny",
  },
  "send.above_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny",
  },
  "consent.edit": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "allow",
  },
  "profile.merge": {
    super_admin: "allow", crm_manager: "deny", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "allow",
  },
  "profile.delete": {
    super_admin: "allow", crm_manager: "deny", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "request",
  },
  "audit.view": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny",
  },
  killswitch: {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny",
  },
};

describe("PRD 17.2 permission matrix", () => {
  it("has an entry for every action × role (no gaps)", () => {
    expect(Object.keys(PRD_17_2).sort()).toEqual([...ACTIONS].sort());
    for (const action of ACTIONS) {
      expect(Object.keys(PRD_17_2[action]).sort()).toEqual([...ROLES].sort());
    }
  });

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      it(`${role} / ${action} = ${PRD_17_2[action][role]}`, () => {
        expect(grantFor(role, action)).toBe(PRD_17_2[action][role]);
      });
    }
  }
});

describe("fail-closed resolution", () => {
  it("unknown / absent role is denied everywhere", () => {
    for (const action of ACTIONS) {
      expect(grantFor("nope", action)).toBe("deny");
      expect(grantFor(null, action)).toBe("deny");
      expect(isPermitted(undefined, action)).toBe(false);
    }
  });

  it("own_unit is denied without a defined scope, allowed with one", () => {
    // unit_manager view_list is own_unit
    expect(resolveGrant("unit_manager", "profile.view_list")).toBe("needs_scope");
    expect(isPermitted("unit_manager", "profile.view_list")).toBe(false);
    expect(resolveGrant("unit_manager", "profile.view_list", { hasUnitScope: true })).toBe("allow");
    expect(isPermitted("unit_manager", "profile.view_list", { hasUnitScope: true })).toBe(true);
  });

  it("deferred grants are not 'permitted now'", () => {
    expect(resolveGrant("crm_operator", "export.at_or_below_threshold")).toBe("needs_approval");
    expect(isPermitted("crm_operator", "export.at_or_below_threshold")).toBe(false);
    expect(resolveGrant("crm_operator", "workflow.create")).toBe("draft_only");
    expect(isPermitted("crm_operator", "workflow.create")).toBe(false);
    expect(resolveGrant("data_steward", "profile.delete")).toBe("request_only");
    expect(isPermitted("data_steward", "profile.delete")).toBe(false);
  });

  it("masked counts as permitted to open the list", () => {
    expect(resolveGrant("analyst", "profile.view_list")).toBe("masked");
    expect(isPermitted("analyst", "profile.view_list")).toBe(true);
  });
});

describe("contact masking (server-side)", () => {
  it("masks analyst, and any unscoped unit_manager; clears full-contact roles", () => {
    expect(shouldMaskContact("analyst")).toBe(true); // view_contact = deny
    expect(shouldMaskContact("crm_operator")).toBe(false); // allow
    expect(shouldMaskContact("data_steward")).toBe(false); // allow
    expect(shouldMaskContact("crm_manager")).toBe(false);
    expect(shouldMaskContact("super_admin")).toBe(false);
    // unscoped unit_manager: view_contact own_unit -> needs_scope != allow -> masked
    expect(shouldMaskContact("unit_manager")).toBe(true);
    expect(shouldMaskContact("unit_manager", { hasUnitScope: true })).toBe(false);
  });

  it("denies list access to unknown role (masking is moot)", () => {
    expect(shouldMaskContact("nope")).toBe(true); // fail-closed: not allow
  });
});

describe("nav visibility", () => {
  it("dashboard visible to every valid role, nobody invalid", () => {
    for (const role of ROLES) expect(canSeeNav(role, "/")).toBe(true);
    expect(canSeeNav("nope", "/")).toBe(false);
  });

  it("audience visible to list-viewers (analyst included via masked), not unscoped unit_manager", () => {
    expect(canSeeNav("analyst", "/audience")).toBe(true);
    expect(canSeeNav("data_steward", "/audience")).toBe(true);
    expect(canSeeNav("unit_manager", "/audience")).toBe(false); // needs_scope
  });

  it("exports hidden for analyst (deny), visible for approval roles", () => {
    expect(canSeeNav("analyst", "/exports")).toBe(false);
    expect(canSeeNav("crm_operator", "/exports")).toBe(true); // approval
    expect(canSeeNav("crm_manager", "/exports")).toBe(true); // allow
  });

  it("settings gated on audit.view", () => {
    expect(canSeeNav("super_admin", "/settings")).toBe(true);
    expect(canSeeNav("crm_manager", "/settings")).toBe(true);
    expect(canSeeNav("crm_operator", "/settings")).toBe(false);
    expect(canSeeNav("analyst", "/settings")).toBe(false);
  });

  it("unknown routes are hidden (fail-closed)", () => {
    expect(canSeeNav("super_admin", "/nope")).toBe(false);
  });
});
