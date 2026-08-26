import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD SUPPORT: every `app/dev/*` preview page MUST render a <DevBanner> so a viewer (and a
 * screenshot) always knows whether it is looking at FIXTURE data or a LIVE, session-dependent
 * render. Two incidents traced to the missing marker: a fixture page read as production, and a
 * live-but-session-less page (/dev/shell) read as a production outage. The marker closes both.
 *
 * Pure: the analyzer takes {path, content} pairs so it can be proven to bite on synthetic input.
 * The test wires it to the real app/dev tree.
 */

export interface DevPage {
  path: string;
  content: string;
}

/** A dev page is compliant iff its source references the DevBanner component (import + render). */
export function findUnmarkedDevPages(pages: DevPage[]): string[] {
  return pages.filter((p) => !/\bDevBanner\b/.test(p.content)).map((p) => p.path);
}

/** Walk app/dev for every page.tsx (any depth). */
export function readDevPages(devRoot: string): DevPage[] {
  const out: DevPage[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx") out.push({ path: full, content: readFileSync(full, "utf8") });
    }
  };
  walk(devRoot);
  return out;
}
