import { describe, it, expect } from "vitest";
import {
  grantFor,
  resolveGrant,
  isPermitted,
  shouldMaskContact,
  canSeeContactPII,
  canSeeMedical,
  canManageRoles,
  canImportAudience,
  canSeeNav,
  effectiveRole,
  isActiveRole,
  ACTIVE_ROLES,
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
    unit_manager: "own_unit", analyst: "masked", data_steward: "allow", viewer: "masked",
  },
  "profile.view_contact": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "deny", data_steward: "allow", viewer: "deny",
  },
  "profile.view_health": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "segment.build": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "allow", data_steward: "deny", viewer: "deny",
  },
  "export.at_or_below_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "approval", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "export.above_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "workflow.create": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "draft",
    unit_manager: "draft", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "workflow.activate": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "send.at_or_below_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "allow",
    unit_manager: "own_unit", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "send.above_threshold": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  "consent.edit": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "allow", viewer: "deny",
  },
  "profile.merge": {
    super_admin: "allow", crm_manager: "deny", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "allow", viewer: "deny",
  },
  "profile.delete": {
    super_admin: "allow", crm_manager: "deny", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "request", viewer: "deny",
  },
  "audit.view": {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny", viewer: "deny",
  },
  killswitch: {
    super_admin: "allow", crm_manager: "allow", crm_operator: "deny",
    unit_manager: "deny", analyst: "deny", data_steward: "deny", viewer: "deny",
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

  it("the current extensions are edit_demographic + role.granted + audience.import, and NONE is in the PRD copy", () => {
    expect([...EXTENSION_ACTIONS]).toEqual(["profile.edit_demographic", "role.granted", "audience.import"]);
    expect(Object.prototype.hasOwnProperty.call(PRD_17_2, "profile.edit_demographic")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(PRD_17_2, "role.granted")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(PRD_17_2, "audience.import")).toBe(false);
  });

  it("audience.import is SUPER-ADMIN ONLY (Fase 1) — every other role denied, and canImportAudience bites", () => {
    expect(grantFor("super_admin", "audience.import")).toBe("allow");
    for (const role of ["crm_manager", "crm_operator", "unit_manager", "analyst", "data_steward", "viewer"] as const) {
      expect(grantFor(role, "audience.import")).toBe("deny");
    }
    expect(canImportAudience("super_admin")).toBe(true);
    expect(canImportAudience("crm_manager")).toBe(false); // may widen later, denied in Fase 1
    expect(canImportAudience("viewer")).toBe(false);
    expect(canImportAudience(null)).toBe(false); // fail-closed
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

describe("role administration is SUPER-ADMIN EXCLUSIVE (K-43, the WAJIB)", () => {
  it("role.granted is 'allow' for super_admin and 'deny' for EVERY other role — proves it bites", () => {
    expect(grantFor("super_admin", "role.granted")).toBe("allow");
    // The whole point: CRM Manager and Viewer must NOT be able to hand out roles. And nobody else.
    for (const role of ["crm_manager", "crm_operator", "unit_manager", "analyst", "data_steward", "viewer"] as const) {
      expect(grantFor(role, "role.granted")).toBe("deny");
    }
  });

  it("canManageRoles is true ONLY for super_admin (CRM Manager + Viewer explicitly excluded)", () => {
    expect(canManageRoles("super_admin")).toBe(true);
    expect(canManageRoles("crm_manager")).toBe(false); // reads all screens, but never role admin
    expect(canManageRoles("viewer")).toBe(false);
    for (const role of ["crm_operator", "unit_manager", "analyst", "data_steward"] as const) {
      expect(canManageRoles(role)).toBe(false);
    }
    expect(canManageRoles("nope")).toBe(false); // fail-closed
    expect(canManageRoles(null)).toBe(false);
  });
});

describe("Viewer role (K-43 three-role model) — strictly view-only, masked contact", () => {
  it("sees the list (masked) but can touch NOTHING else", () => {
    expect(grantFor("viewer", "profile.view_list")).toBe("masked");
    expect(isPermitted("viewer", "profile.view_list")).toBe(true); // may open the list
    expect(shouldMaskContact("viewer")).toBe(true); // contact masked (decision K-43)
    // Every write/execute action is denied — including segment SAVE (separates Viewer from analyst).
    for (const action of [
      "profile.view_contact", "profile.view_health", "segment.build",
      "export.at_or_below_threshold", "export.above_threshold",
      "workflow.create", "workflow.activate",
      "send.at_or_below_threshold", "send.above_threshold",
      "consent.edit", "profile.merge", "profile.delete", "audit.view", "killswitch",
      "profile.edit_demographic", "role.granted",
    ] as const) {
      expect(isPermitted("viewer", action)).toBe(false);
    }
  });

  it("differs from analyst by exactly one cell: analyst may build segments, Viewer may not", () => {
    expect(grantFor("analyst", "segment.build")).toBe("allow");
    expect(grantFor("viewer", "segment.build")).toBe("deny");
  });

  it("nav: Viewer sees Dashboard, Audience, Quality — and nothing that writes/sends", () => {
    expect(canSeeNav("viewer", "/")).toBe(true);
    expect(canSeeNav("viewer", "/audience")).toBe(true); // masked list
    expect(canSeeNav("viewer", "/quality")).toBe(true);
    for (const href of ["/segments", "/workflows", "/campaigns", "/templates", "/messages", "/consent", "/exports", "/settings"]) {
      expect(canSeeNav("viewer", href)).toBe(false);
    }
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

describe("three active roles only, retired PRD roles fail closed (K-44)", () => {
  const RETIRED: Role[] = ["crm_operator", "unit_manager", "analyst", "data_steward"];

  it("ACTIVE_ROLES is exactly the three the product uses", () => {
    expect([...ACTIVE_ROLES].sort()).toEqual(["crm_manager", "super_admin", "viewer"]);
  });

  it("the four dropped PRD roles are NOT active", () => {
    for (const r of RETIRED) expect(isActiveRole(r)).toBe(false);
    for (const r of ACTIVE_ROLES) expect(isActiveRole(r)).toBe(true);
  });

  it("the matrix STILL contains all six PRD roles (parity preserved, reversal cheap)", () => {
    // The retired roles are kept in ROLES/MATRIX on purpose — this is the property that makes K-44 a
    // one-line reversal, not a rewrite. Removing them from ROLES should fail THIS test, on purpose.
    for (const r of RETIRED) expect(ROLES).toContain(r);
  });

  it("effectiveRole() FAILS CLOSED: a stored retired role resolves to null = no access", () => {
    // The biting rule (LARANGAN): a crm_user_role row carrying a dropped role must read as no-access,
    // never as a known role that quietly grants. This is what getCurrentUserRole() runs every row through.
    for (const r of RETIRED) expect(effectiveRole(r)).toBeNull();
    expect(effectiveRole("bogus")).toBeNull();
    expect(effectiveRole(null)).toBeNull();
    for (const r of ACTIVE_ROLES) expect(effectiveRole(r)).toBe(r);
  });

  it("a retired stored role, once resolved to null, is denied every action", () => {
    // effectiveRole('analyst') === null, and null is denied everywhere (the layer above the matrix).
    for (const action of ACTIONS) {
      expect(isPermitted(effectiveRole("analyst"), action)).toBe(false);
      expect(isPermitted(effectiveRole("data_steward"), action)).toBe(false);
    }
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

  it("exports is GONE from nav for every role (the Exports screen was removed)", () => {
    // The Exports feature was deleted (the route now redirects to /campaigns); no role sees it in nav,
    // even those still holding export.* in the matrix (kept for PRD 17.2 parity, K-44).
    for (const r of ["super_admin", "crm_manager", "crm_operator", "analyst", "viewer"] as const) {
      expect(canSeeNav(r, "/exports")).toBe(false);
    }
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
