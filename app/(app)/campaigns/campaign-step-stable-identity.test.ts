import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the "Nama kampanye" focus bug (2026-09-02): `Step` was defined INSIDE
 * CampaignFlow, so every keystroke gave it a new function identity and React remounted its subtree —
 * dropping the focused input's focus each keystroke. The fix hoists Step to module scope.
 *
 * This is a SOURCE guard (no DOM / jsdom / new library): a React component (a capitalised `function`)
 * must never be defined at an INDENTED position — i.e. nested inside another function. Module-scope
 * components sit at column 0. If someone re-nests a component, this fails with a clear reason.
 */
describe("campaign-flow component identity", () => {
  const src = readFileSync(join(__dirname, "campaign-flow.tsx"), "utf8");

  it("defines Step at module scope, not inside CampaignFlow", () => {
    expect(src).toMatch(/^function Step\(/m); // module-scoped (column 0)
  });

  it("defines NO React component nested inside another function (would remount + drop focus)", () => {
    // An indented `function <Capitalised>` is a component defined inside another function — the exact
    // shape of the focus bug. Helper functions here are lower-cased (nameErrText, goBuildSegment, …),
    // so only component-like names are caught.
    const nested = src.match(/^\s+function [A-Z]\w*\(/gm) ?? [];
    expect(nested).toEqual([]);
  });
});
