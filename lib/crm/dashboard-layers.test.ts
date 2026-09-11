import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD (K-61, revised 7 Sep 2026): ONE Dashboard, TWO layers, and the boundary is STATED.
 *
 * WHY THIS EXISTS — read before "fixing" a failure by weakening it.
 *
 * The board summary was briefly its own page at /bod. That was the wrong shape: a second screen
 * reading the same pool from the same data drifts away from the first one on its own, and nobody
 * notices until two numbers disagree in a meeting. It is now the TOP LAYER of the Dashboard, and
 * three cards that existed in BOTH places were removed from the operational layer.
 *
 * The rule this pins is narrower and more useful than "one timestamp per page", which is what K-61
 * originally said. What was actually wrong on the old Dashboard was never that it had several
 * freshnesses — an operational screen legitimately does. It was that it had several freshnesses and
 * NOTHING SAID SO. So the rule is: one measurement time PER SECTION, and the boundary between
 * sections is written down. Pouring both layers into one unlabelled stream would bring back exactly
 * the original bug, this time on purpose.
 *
 * These are source scans, not renders, because the thing being prevented is a FILE-level mistake:
 * someone re-adding a card, or the two layers quietly merging. A rendering test would pass on a
 * page that shows the same figure twice.
 */

const ROOT = process.cwd();
const DASH = readFileSync(join(ROOT, "components", "dashboard", "dashboard-content.tsx"), "utf8");
const SUMMARY = readFileSync(join(ROOT, "components", "dashboard", "bod-content.tsx"), "utf8");

/** Strip comments so the scan tests CODE, not the prose explaining why the code is that way — this
 *  file's own comments name the very things they forbid. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const DASH_CODE = code(DASH);
const SUMMARY_CODE = code(SUMMARY);

describe("Dashboard — the three duplicated cards are gone from the operational layer", () => {
  it("REACH is in the summary only — no second live copy below it", () => {
    // The old operational card was <PoolReachCard>, fed by a client-fetched `reach` block.
    expect(DASH_CODE).not.toContain("PoolReachCard");
    expect(DASH_CODE).not.toContain("reachEmail");
    expect(DASH_CODE).not.toContain("reachWhatsapp");
    // …and the client no longer fetches that block at all, so there is nothing to render by accident.
    expect(DASH_CODE).not.toMatch(/"reach"/);
    // It IS in the summary.
    expect(SUMMARY_CODE).toContain("reachEmail");
    expect(SUMMARY_CODE).toContain("reachWhatsapp");
  });

  it("UNIT SPREAD is in the summary only — the operational block is removed", () => {
    expect(DASH_CODE).not.toContain("unitSpread");
    expect(DASH_CODE).not.toContain("unitTitle");
    expect(DASH_CODE).not.toContain("unitScaleNote");
    expect(SUMMARY_CODE).toContain("unitsTitle");
  });

  it("GROWTH is in the summary only, as a chart — the operational date card is removed", () => {
    expect(DASH_CODE).not.toContain("lastProfile");
    expect(DASH_CODE).not.toContain("loadsHint");
    expect(SUMMARY_CODE).toContain("growthTitle");
    expect(SUMMARY_CODE).toContain("growthPoints");
  });

  it("what was NOT duplicated stays in the operational layer — removal, not deletion", () => {
    // The owner's instruction was that operational detail MOVES DOWN, never disappears. These are
    // the blocks with no counterpart in the summary; if a future edit takes one out, that is a
    // deletion and this test is where it should be argued, not discovered.
    for (const kept of ["CandidateCard", "eventTitle", "coverageTitle", "importDob", "liveTitle"]) {
      expect(DASH_CODE, `operational block "${kept}" must stay on the Dashboard`).toContain(kept);
    }
  });
});

describe("Dashboard — the boundary between the two layers is stated, not implied", () => {
  it("the operational layer has its own heading AND its own freshness note", () => {
    expect(DASH_CODE).toContain("opsTitle");
    expect(DASH_CODE).toContain("opsNote");
  });

  it("the summary is a bounded section with its own timestamp — boundary survives the title removal", () => {
    expect(SUMMARY_CODE).toContain("<section");
    // The section TITLE was removed 8 Sep 2026; the BOUNDARY that separated the two layers must not
    // go with it. It now lives in the thick top rule. If a future edit drops this, the summary and
    // the operational layer merge back into one unlabelled stream — the K-61 bug, on purpose.
    expect(SUMMARY_CODE, "the inter-layer boundary (top rule) must remain after the title was removed")
      .toContain("border-t-2 border-ink");
    // A section that lost its own timestamp would be indistinguishable from the layer below it.
    expect(SUMMARY_CODE).toContain("b.measuredAt");
    // …and the subtitle stays as the section's opening line (the owner kept it explicitly).
    expect(SUMMARY_CODE).toContain("b.subtitle");
  });

  it("both layer labels exist in BOTH languages — a boundary nobody can read is not stated", () => {
    for (const lang of ["id", "en"]) {
      const dict = readFileSync(join(ROOT, "lib", "i18n", "messages", `${lang}.ts`), "utf8");
      expect(dict, `${lang}: opsTitle`).toContain("opsTitle:");
      expect(dict, `${lang}: opsNote`).toContain("opsNote:");
      expect(dict, `${lang}: staleWarning`).toContain("staleWarning:");
      expect(dict, `${lang}: unitsShopExcluded`).toContain("unitsShopExcluded:");
    }
  });
});

describe("Dashboard — /bod is a redirect, not a second screen", () => {
  const BOD = code(readFileSync(join(ROOT, "app", "(app)", "bod", "page.tsx"), "utf8"));

  it("redirects and fetches nothing", () => {
    expect(BOD).toContain("redirect");
    expect(BOD).not.toContain("fetchBodSnapshot");
    expect(BOD).not.toContain("BodSummary");
  });

  it("the summary is mounted by the Dashboard page, which is where the data is fetched", () => {
    const page = code(readFileSync(join(ROOT, "app", "(app)", "page.tsx"), "utf8"));
    expect(page).toContain("fetchBodSnapshot");
    expect(page).toContain("DashboardContent");
    expect(DASH_CODE).toContain("BodSummary");
  });
});
