import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD against dead Tailwind classes on this project's flat design tokens.
 *
 * WHY THIS TEST EXISTS — read before "fixing" a failure by deleting the test:
 * tailwind.config.ts maps `red / blue / amber / green` to a BARE var (and `ink /
 * glass` to named sub-keys only). That removes the numeric colour scale AND blocks
 * opacity modifiers. So a `<token>-<number>` class, or an opacity modifier on a flat
 * colour token, generates NO CSS AT ALL — not the wrong colour, no rule at all.
 * Nothing errors, the element just renders untinted, and it ships unseen (exactly how
 * the audience quality banner rendered invisibly for a whole sprint).
 *
 * The README rule "hard-coded hex is a review-blocking defect" catches hex, but not
 * these vanishing classes. This test is that missing guard. The ONLY correct options
 * are the flat token classes (`text-amber`, `bg-red`, `text-ink-soft`) or the `.tint-*`
 * utilities in globals.css. If this fails, change the class — do not weaken the test.
 *
 * Comments are stripped before scanning, on purpose: this file and others DISCUSS the
 * dead classes in prose, and a guard that tripped on its own documentation would be
 * noise. Only real code (className strings) is checked.
 */

const ROOTS = ["app", "components", "lib"];
const EXT = /\.(ts|tsx|mdx)$/;

const ALL_TOKENS = "red|blue|amber|green|ink|glass";
const FLAT_COLORS = "red|blue|amber|green";

// Numeric scale on any token — the utility does not exist.
const NUMERIC = new RegExp(`\\b(${ALL_TOKENS})-\\d`);
// Opacity modifier on a flat colour token — silently drops to no rule.
const OPACITY = new RegExp(`\\b(${FLAT_COLORS})(-\\d+)?/(\\[|\\d)`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (EXT.test(p)) out.push(p);
  }
  return out;
}

/** Blank out // and /* *\/ comments line-by-line, preserving line count/numbers. */
function stripCommentsPerLine(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (let line of src.split("\n")) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      line = line.slice(end + 2);
      inBlock = false;
    }
    line = line.replace(/\/\*.*?\*\//g, ""); // inline block comments
    const open = line.indexOf("/*");
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    line = line.replace(/\/\/.*/, ""); // line comments
    out.push(line);
  }
  return out;
}

describe("no dead Tailwind classes on flat design tokens", () => {
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(r);
    } catch {
      return [];
    }
  });

  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(10); // sanity: the walk found the tree
  });

  const offenders: string[] = [];
  for (const file of files) {
    stripCommentsPerLine(readFileSync(file, "utf8")).forEach((line, i) => {
      if (NUMERIC.test(line) || OPACITY.test(line)) {
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      }
    });
  }

  it("has no `<token>-<number>` or flat-token opacity classes (they emit no CSS)", () => {
    expect(
      offenders,
      offenders.length
        ? `Dead Tailwind classes found — these generate NO CSS (see this test's header). ` +
            `Use a flat token class (text-amber, bg-red) or a .tint-* utility:\n${offenders.join("\n")}`
        : "",
    ).toEqual([]);
  });
});
