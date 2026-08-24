import { describe, it, expect } from "vitest";
import {
  grantFor,
  resolveGrant,
  isPermitted,
  shouldMaskContact,
  canSeeContactPII,
  canSeeMedical,
  canSeeNav,
  ROLES,
  ACTIONS,
  PRD_ACTIONS,
  EXTENSION_ACTIONS,
  type Role,
  type Grant,
} from "./roles";

/**
 * This test IS the PRD 17.2 matrix in machine-checkable form. If a cell changes here
 * without a corresponding PRD change, that is the bug. Row order matches the PRD table.
 */
const PRD_17_2: Record<(typeof PRD_ACTIONS)[number], Record<Role, Grant>> = {
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
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
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
  it("PRD_17_2 machine copy covers exactly the PRD actions × every role (no gaps)", () => {
    expect(Object.keys(PRD_17_2).sort()).toEqual([...PRD_ACTIONS].sort());
    for (const action of PRD_ACTIONS) {
      expect(Object.keys(PRD_17_2[action]).sort()).toEqual([...ROLES].sort());
    }
  });

  // The live MATRIX (grantFor) MUST equal the PRD copy for every PRD action × role.
  for (const action of PRD_ACTIONS) {
    for (const role of ROLES) {
      it(`${role} / ${action} = ${PRD_17_2[action][role]}`, () => {
        expect(grantFor(role, action)).toBe(PRD_17_2[action][role]);
      });
    }
  }
});

describe("extensions beyond PRD 17.2 (kept explicitly separate, K-32)", () => {
  it("EXTENSION_ACTIONS is disjoint from PRD_ACTIONS — no non-PRD action is smuggled into the PRD list", () => {
    const prd = new Set<string>(PRD_ACTIONS);
    for (const e of EXTENSION_ACTIONS) expect(prd.has(e)).toBe(false);
    // ACTIONS is exactly PRD ∪ extensions.
    expect([...ACTIONS].sort()).toEqual([...PRD_ACTIONS, ...EXTENSION_ACTIONS].sort());
  });

  it("profile.edit_demographic is the only current extension, and it is NOT in the PRD copy", () => {
    expect([...EXTENSION_ACTIONS]).toEqual(["profile.edit_demographic"]);
    expect(Object.prototype.hasOwnProperty.call(PRD_17_2, "profile.edit_demographic")).toBe(false);
  });

  it("profile.edit_demographic grants: managers + operator + steward may edit; analyst may not; unit_manager fail-closed", () => {
    expect(grantFor("super_admin", "profile.edit_demographic")).toBe("allow");
    expect(grantFor("crm_manager", "profile.edit_demographic")).toBe("allow");
    expect(grantFor("crm_operator", "profile.edit_demographic")).toBe("allow"); // the phone-staff use case
    expect(grantFor("data_steward", "profile.edit_demographic")).toBe("allow");
    expect(grantFor("analyst", "profile.edit_demographic")).toBe("deny"); // no contact/write access
    // unit_manager own_unit -> needs_scope (denied) until a scope table exists.
    expect(resolveGrant("unit_manager", "profile.edit_demographic")).toBe("needs_scope");
    expect(isPermitted("unit_manager", "profile.edit_demographic")).toBe(false);
  });
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

  it("crm_operator may now export at or below threshold (opened 24 Aug 2026), but NOT above", () => {
    expect(isPermitted("crm_operator", "export.at_or_below_threshold")).toBe(true);
    expect(isPermitted("crm_operator", "export.above_threshold")).toBe(false);
  });

  it("deferred grants are not 'permitted now'", () => {
    // unit_manager keeps the approval grant (fail-closed: no unit-scope table exists yet).
    expect(resolveGrant("unit_manager", "export.at_or_below_threshold")).toBe("needs_approval");
    expect(isPermitted("unit_manager", "export.at_or_below_threshold")).toBe(false);
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

describe("K-31 sensitive-field gates (identity=view_contact, medical=view_health)", () => {
  it("canSeeContactPII = the roles allowed profile.view_contact IN FULL", () => {
    // These roles receive NIK/DOB/gender/province/address/emergency from the server.
    expect(canSeeContactPII("super_admin")).toBe(true);
    expect(canSeeContactPII("crm_manager")).toBe(true);
    expect(canSeeContactPII("crm_operator")).toBe(true); // CS staff — the point of K-31
    expect(canSeeContactPII("data_steward")).toBe(true); // NIK = strongest dedup key
    // analyst may not see contact at all → never receives the NIK from the server (not "hidden").
    expect(canSeeContactPII("analyst")).toBe(false);
    // unit_manager is fail-closed until a unit scope exists.
    expect(canSeeContactPII("unit_manager")).toBe(false);
    expect(canSeeContactPII("unit_manager", { hasUnitScope: true })).toBe(true);
    expect(canSeeContactPII("nope")).toBe(false); // fail-closed
  });

  it("canSeeMedical = ONLY the roles allowed profile.view_health", () => {
    expect(canSeeMedical("super_admin")).toBe(true);
    expect(canSeeMedical("crm_manager")).toBe(true);
    // Everyone else — including the new NIK-seers — must NOT receive blood type / clinical data.
    for (const role of ["crm_operator", "data_steward", "unit_manager", "analyst"] as const) {
      expect(canSeeMedical(role)).toBe(false);
    }
    expect(canSeeMedical("unit_manager", { hasUnitScope: true })).toBe(false);
    expect(canSeeMedical("nope")).toBe(false);
  });

  it("NIK is NOT medical: a contact role that lacks view_health still sees identity, never blood type", () => {
    // This is the whole K-31 claim in one assertion, for the two roles it newly affects.
    for (const role of ["crm_operator", "data_steward"] as const) {
      expect(canSeeContactPII(role)).toBe(true); // gets NIK/DOB/address
      expect(canSeeMedical(role)).toBe(false); // does NOT get golongan darah / clinical
    }
  });

  it("the two gates are independent, never collapsed into one", () => {
    // A role with medical but not contact must not exist by accident, and vice-versa is the norm.
    // (No role is medical-without-contact in the matrix, but the gates are separate predicates so
    // a future matrix change cannot silently fuse them.)
    expect(canSeeContactPII("crm_operator") && !canSeeMedical("crm_operator")).toBe(true);
    expect(canSeeMedical("crm_manager") && canSeeContactPII("crm_manager")).toBe(true);
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
