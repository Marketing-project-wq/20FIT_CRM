import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD for the scenario-C load-bearing assumption (see campaign-flow.tsx restore effect + campaign-nav.ts):
 * the composer⇄Segmen draft bounce-back survives the browser Back button ONLY because the Campaigns
 * tabs are a URL searchParam on ONE server-rendered route — a tab switch (or Back) re-renders the
 * server page, unmounting/remounting CampaignFlow and re-running its restore effect.
 *
 * If someone converts the tab to CLIENT state (a "use client" page with useState), CampaignFlow stops
 * unmounting on a tab switch, the restore effect never re-runs on Back, and the draft is silently lost.
 * This is a source-scan heuristic (no jsdom / no new library): it fails the moment the Campaigns page
 * stops being a server component that derives its tab from searchParams.
 */
const PAGE = join(process.cwd(), "app/(app)/campaigns/page.tsx");

describe("Campaigns tab must stay a server-rendered searchParam (scenario-C guard)", () => {
  const src = readFileSync(PAGE, "utf8");

  it("the Campaigns page is a SERVER component (no 'use client')", () => {
    // A leading "use client" directive would make the whole page (and its tab) client-rendered.
    const firstCode = src.split("\n").find((l) => l.trim() && !l.trim().startsWith("//"))?.trim() ?? "";
    expect(firstCode).not.toMatch(/^["']use client["']/);
    expect(src).not.toMatch(/^\s*["']use client["']/m);
  });

  it("derives the active tab from searchParams, not client state", () => {
    expect(src).toMatch(/searchParams/);
    expect(src).toMatch(/rawTab\s*===\s*["']segmen["']/); // the tab is read from the URL param
  });

  it("does not manage the tab with useState", () => {
    expect(src).not.toMatch(/useState/);
  });
});
