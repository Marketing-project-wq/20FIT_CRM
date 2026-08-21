import { describe, it, expect } from "vitest";
import {
  classifyAction,
  matchesRule,
  matchesAny,
  toPostgrestOr,
  retentionRatio,
  OPERATIONAL_RULES,
  COMPLIANCE_RULES,
} from "./retention-policy";

describe("classifyAction (single source)", () => {
  it("operational = the purge allowlist", () => {
    for (const a of ["profile.viewed", "list.viewed", "search.run", "login.ok"]) {
      expect(classifyAction(a)).toBe("operational");
    }
  });
  it("the exact profile-search action is operational (purged after 90 days)", () => {
    // Sprint 3J writes exactly this action name. Confirmed here (not assumed) so it can't
    // silently land outside migration 8's allowlist; parity with the SQL stays enforced
    // by retention-policy.parity.test.ts.
    expect(classifyAction("search.performed")).toBe("operational");
  });
  it("the exact password-reset action is operational (Sprint 3T, purged after 90 days)", () => {
    // app/forgot-password/actions.ts writes exactly this action name. Confirmed (not assumed)
    // — the fourth time an action name is checked against the allowlist by name, after
    // quality.viewed / suppression.* / segment.* landed between the lists.
    expect(classifyAction("login.password_reset_requested")).toBe("operational");
  });
  it("compliance = the permanently-excluded categories", () => {
    for (const a of ["consent.x", "suppression.x", "role.granted", "profile.deleted", "export.x", "retention.x"]) {
      expect(classifyAction(a)).toBe("compliance");
    }
  });
  it("the exact suppression write-path actions are compliance (never purged)", () => {
    // Migrasi 9 menulis persis dua nama aksi ini. Permintaan berhenti dihubungi =
    // bukti hukum → tidak boleh ikut terpangkas setelah 90 hari. Dikonfirmasi di sini
    // (bukan diasumsikan); paritas dengan denylist SQL migrasi 8 dijamin parity.test.
    expect(classifyAction("suppression.added")).toBe("compliance");
    expect(classifyAction("suppression.lifted")).toBe("compliance");
  });
  it("the EXACT demographic write-path action is compliance (Option 2, K-09)", () => {
    // crm_upsert_profile_demographic menulis PERSIS nama aksi ini. Penyuntingan data
    // pelanggan oleh staf = catatan "siapa mengubah, kapan" yang harus bertahan pangkas
    // operasional 90 hari. Nama diuji PERSIS seperti yang ditulis fungsi (bukan prefix).
    expect(classifyAction("profile.demographic_updated")).toBe("compliance");
  });
  it("anything else is 'other'", () => {
    expect(classifyAction("test.trigger_check")).toBe("other");
    expect(classifyAction("whatever.new")).toBe("other");
  });
  it("does not confuse profile.deleted (compliance) with profile.viewed (operational)", () => {
    expect(classifyAction("profile.viewed")).toBe("operational");
    expect(classifyAction("profile.deleted")).toBe("compliance");
  });
});

describe("matchesRule / matchesAny", () => {
  it("exact matches only the exact string", () => {
    expect(matchesRule({ kind: "exact", value: "list.viewed" }, "list.viewed")).toBe(true);
    expect(matchesRule({ kind: "exact", value: "list.viewed" }, "list.viewedx")).toBe(false);
  });
  it("prefix matches by startsWith", () => {
    expect(matchesRule({ kind: "prefix", value: "role." }, "role.granted")).toBe(true);
    expect(matchesRule({ kind: "prefix", value: "role." }, "roles.granted")).toBe(false);
  });
  it("matchesAny is an OR over rules", () => {
    expect(matchesAny(OPERATIONAL_RULES, "search.foo")).toBe(true);
    expect(matchesAny(OPERATIONAL_RULES, "role.granted")).toBe(false);
  });
});

describe("toPostgrestOr derivation", () => {
  it("derives the exact strings /api/audit passes to .or()", () => {
    expect(toPostgrestOr(OPERATIONAL_RULES)).toBe(
      "action.eq.profile.viewed,action.eq.list.viewed,action.like.search.*,action.like.login.*",
    );
    expect(toPostgrestOr(COMPLIANCE_RULES)).toBe(
      "action.like.consent.*,action.like.suppression.*,action.like.role.*,action.eq.profile.deleted,action.eq.profile.demographic_updated,action.like.export.*,action.like.retention.*",
    );
  });
});

describe("retentionRatio", () => {
  it("counts by class over a given set of actions", () => {
    const actions = [
      "list.viewed", "list.viewed", "profile.viewed", // 3 operational
      "role.granted", "retention.purge_executed", // 2 compliance
      "test.trigger_check", // 1 other
    ];
    expect(retentionRatio(actions)).toEqual({ compliance: 2, operational: 3, other: 1, total: 6 });
  });
  it("handles an empty set", () => {
    expect(retentionRatio([])).toEqual({ compliance: 0, operational: 0, other: 0, total: 0 });
  });
  it("compliance + operational + other always equals total", () => {
    const r = retentionRatio(["a.b", "list.viewed", "role.x", "search.y", "z"]);
    expect(r.compliance + r.operational + r.other).toBe(r.total);
  });
});
