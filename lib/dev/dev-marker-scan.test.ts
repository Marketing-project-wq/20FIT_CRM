import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { findUnmarkedDevPages, readDevPages } from "./dev-marker-scan";

const DEV_ROOT = join(process.cwd(), "app", "dev");

describe("every app/dev page renders a <DevBanner> marker (fixture vs live)", () => {
  const pages = readDevPages(DEV_ROOT);

  it("finds all the dev preview pages (not testing air)", () => {
    // Six today: preview, preview-campaign, preview-settings, preview-tabs, tokens, shell.
    expect(pages.length).toBeGreaterThanOrEqual(6);
  });

  it("no dev page is missing its DevBanner marker", () => {
    const unmarked = findUnmarkedDevPages(pages);
    expect(
      unmarked,
      unmarked.length
        ? "These /dev pages render no <DevBanner> — a viewer/screenshot can't tell fixture from " +
            "live. Add <DevBanner mode=\"fixture\" /> (hand-set sample data) or " +
            "<DevBanner mode=\"live\" /> (self-fetching production components, needs a session):\n" +
            unmarked.map((p) => `  ${p}`).join("\n")
        : "",
    ).toEqual([]);
  });

  // ── The guard BITES — proven on synthetic input ──
  it("flags a dev page with no DevBanner", () => {
    const pages = [{ path: "app/dev/x/page.tsx", content: "export default function X(){return <div/>}" }];
    expect(findUnmarkedDevPages(pages)).toEqual(["app/dev/x/page.tsx"]);
  });

  it("passes a dev page that renders DevBanner", () => {
    const pages = [
      { path: "app/dev/ok/page.tsx", content: 'import {DevBanner} from "@/components/dev/dev-banner";\nexport default () => <DevBanner mode="fixture" />' },
    ];
    expect(findUnmarkedDevPages(pages)).toEqual([]);
  });
});
