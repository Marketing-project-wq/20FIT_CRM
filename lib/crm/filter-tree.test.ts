import { describe, it, expect } from "vitest";
import {
  validateFilterTree,
  filterTreeToExpr,
  describeFilterTree,
  MAX_CONDITIONS,
  type FilterNode,
} from "./filter-tree";
import { SEGMENT_NULL } from "./audience-constants";

const g = (op: "AND" | "OR", ...children: FilterNode[]): FilterNode => ({ kind: "group", op, children });
const c = (field: string, value?: string): FilterNode =>
  ({ kind: "condition", field: field as never, value });

describe("validateFilterTree", () => {
  it("accepts a flat AND and a flat OR", () => {
    expect(validateFilterTree(g("AND", c("hasEmail"), c("unit", "arena"))).ok).toBe(true);
    expect(validateFilterTree(g("OR", c("hasEmail"), c("hasPhone"))).ok).toBe(true);
  });
  it("accepts OR nested inside AND (two levels)", () => {
    const t = g("AND", g("OR", c("hasEmail"), c("hasPhone")), c("unit", "arena"));
    expect(validateFilterTree(t).ok).toBe(true);
  });
  it("rejects a root that is not a group", () => {
    expect(validateFilterTree(c("hasEmail")).ok).toBe(false);
  });
  it("rejects an empty group", () => {
    expect(validateFilterTree(g("AND")).ok).toBe(false);
  });
  it("rejects nesting deeper than two levels", () => {
    const t = g("AND", g("OR", g("AND", c("hasEmail"))));
    expect(validateFilterTree(t).ok).toBe(false);
  });
  it("rejects too many conditions", () => {
    const many = Array.from({ length: MAX_CONDITIONS + 1 }, () => c("hasEmail"));
    expect(validateFilterTree(g("AND", ...many)).ok).toBe(false);
  });
  it("rejects unknown field / value", () => {
    expect(validateFilterTree(g("AND", c("unit", "mars"))).ok).toBe(false);
    expect(validateFilterTree(g("AND", c("segment", "vip"))).ok).toBe(false);
  });
  it("rejects a city value with PostgREST-unsafe characters (no silent stripping)", () => {
    expect(validateFilterTree(g("AND", c("city", "ja,karta"))).ok).toBe(false);
    expect(validateFilterTree(g("AND", c("city", "a(b)"))).ok).toBe(false);
    expect(validateFilterTree(g("AND", c("city", "Jakarta"))).ok).toBe(true);
  });
});

describe("filterTreeToExpr", () => {
  it("single condition", () => {
    expect(filterTreeToExpr(g("AND", c("hasEmail")))).toBe("and(email_normalized.not.is.null)");
  });
  it("flat OR of has-email / has-phone", () => {
    expect(filterTreeToExpr(g("OR", c("hasEmail"), c("hasPhone")))).toBe(
      "or(email_normalized.not.is.null,phone_normalized.not.is.null)",
    );
  });
  it("OR inside AND", () => {
    const t = g("AND", g("OR", c("hasEmail"), c("hasPhone")), c("unit", "arena"));
    expect(filterTreeToExpr(t)).toBe(
      "and(or(email_normalized.not.is.null,phone_normalized.not.is.null),first_unit.eq.arena)",
    );
  });
  it("segment NULL cohort and revenue none expand correctly", () => {
    expect(filterTreeToExpr(g("AND", c("segment", SEGMENT_NULL)))).toBe("and(segment.is.null)");
    expect(filterTreeToExpr(g("AND", c("revenue", "none")))).toBe(
      "and(or(lifetime_value.is.null,lifetime_value.eq.0))",
    );
  });
  it("empty root → null (whole pool)", () => {
    expect(filterTreeToExpr(g("AND"))).toBeNull();
  });

  it("absence leaves: noPhone / noEmail → is.null", () => {
    expect(filterTreeToExpr(g("AND", c("noPhone")))).toBe("and(phone_normalized.is.null)");
    expect(filterTreeToExpr(g("AND", c("noEmail")))).toBe("and(email_normalized.is.null)");
  });

  it("the four contact-coverage category trees compose from presence + absence leaves", () => {
    // These are exactly the trees the dashboard export buttons POST for each category.
    expect(filterTreeToExpr(g("AND", c("hasEmail"), c("hasPhone")))).toBe(
      "and(email_normalized.not.is.null,phone_normalized.not.is.null)", // both
    );
    expect(filterTreeToExpr(g("AND", c("hasEmail"), c("noPhone")))).toBe(
      "and(email_normalized.not.is.null,phone_normalized.is.null)", // email only
    );
    expect(filterTreeToExpr(g("AND", c("hasPhone"), c("noEmail")))).toBe(
      "and(phone_normalized.not.is.null,email_normalized.is.null)", // phone only
    );
    expect(filterTreeToExpr(g("AND", c("noPhone"), c("noEmail")))).toBe(
      "and(phone_normalized.is.null,email_normalized.is.null)", // neither
    );
  });

  it("absence leaves validate (no value required)", () => {
    expect(validateFilterTree(g("AND", c("noPhone"), c("noEmail"))).ok).toBe(true);
  });
});

describe("describeFilterTree", () => {
  it("reads back a nested filter in a sentence", () => {
    const t = g("AND", g("OR", c("hasEmail"), c("hasPhone")), c("unit", "arena"));
    expect(describeFilterTree(t)).toBe("(punya email ATAU punya telepon) DAN unit arena");
  });
  it("reads a flat OR without outer parens", () => {
    expect(describeFilterTree(g("OR", c("hasEmail"), c("hasPhone")))).toBe("punya email ATAU punya telepon");
  });
});
