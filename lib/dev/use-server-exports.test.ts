import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanUseServerExports, isUseServerModule, type UseServerViolation } from "./use-server-exports";

/**
 * GUARD for the T-32 class: a "use server" module must export only async functions. See
 * use-server-exports.ts. Two layers: unit tests prove the scanner BITES on synthetic samples, then a
 * repo walk proves every real server-action module is clean.
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib", "components"];
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "coverage"]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(abs);
  }
  return acc;
}

describe("use-server export guard — the scanner bites (T-32 class)", () => {
  it("flags a value const exported from a use-server module", () => {
    const bad = `"use server";\nexport const ROLES = ["a", "b"];\nexport async function act() {}\n`;
    const v = scanUseServerExports(bad, "sample.ts");
    expect(v).toHaveLength(1);
    expect(v[0].snippet).toContain("export const ROLES");
  });

  it("flags a sync function and a non-async default", () => {
    expect(scanUseServerExports(`"use server";\nexport function f(){}`, "s.ts")).toHaveLength(1);
    expect(scanUseServerExports(`"use server";\nexport default { a: 1 };`, "s.ts")).toHaveLength(1);
  });

  it("passes an async-function-only module, and allows erased type exports", () => {
    const good = `"use server";\nimport x from "y";\nexport type T = { a: number };\nexport interface I { b: string }\nexport async function act() {}\nexport default async function d() {}\n`;
    expect(scanUseServerExports(good, "s.ts")).toHaveLength(0);
  });

  it("ignores modules WITHOUT a top-level use-server directive", () => {
    expect(isUseServerModule(`export const X = 1;`)).toBe(false);
    // an inline function-scoped "use server" is not a module directive
    expect(isUseServerModule(`export function f(){ "use server"; }`)).toBe(false);
    expect(scanUseServerExports(`export const X = 1;`, "s.ts")).toHaveLength(0);
  });
});

describe("use-server export guard — every real module is clean", () => {
  it("no 'use server' module in the repo exports a non-async-function value", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
    const violations: UseServerViolation[] = files.flatMap((abs) =>
      scanUseServerExports(readFileSync(abs, "utf8"), abs.replace(ROOT + "/", "")),
    );
    expect(violations, JSON.stringify(violations, null, 2)).toHaveLength(0);
  });
});
