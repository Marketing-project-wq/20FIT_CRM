import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD (T-70, the 12th "cause discarded, replaced by a wrong guess"): every error response from the
 * CSV import route must carry a human `message`. When it doesn't, the wizard falls back to its generic
 * "File tidak bisa dibaca" — which BLAMES THE FILE for what may be an expired session (401), a
 * permission problem, or a server error. The owner lost time to exactly that. This guard makes any
 * future ≥400 response on the import route without a message fail a test.
 *
 * SCOPE: the import route only, as the owner asked. A repo-wide sweep found ~68 other ≥400 responses
 * across ~18 API routes with no message (recorded in TEMUAN T-70); those are consumed by different
 * UIs and are a separate, larger cleanup — not silently blessed here, just out of this guard's scope.
 */

const ROUTE = join(process.cwd(), "app", "api", "audience", "import", "route.ts");

function stripTsComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

export interface MissingMessage {
  status: string;
  snippet: string;
}

/** Every `NextResponse.json(...)` whose status is ≥400 (literal or a `? 4xx : 4xx` ternary) but whose
 *  body has no `message` property (either `message:` or the `{ error, message }` shorthand). */
export function findResponsesMissingMessage(source: string): MissingMessage[] {
  const content = stripTsComments(source);
  const out: MissingMessage[] = [];
  const re = /NextResponse\.json\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < content.length && depth > 0) {
      const c = content[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    const call = content.slice(m.index, i);
    const literal = call.match(/status:\s*(\d{3})/);
    const is4xx = literal
      ? Number(literal[1]) >= 400
      : /status:[^,}]*\?[^:]*\b[45]\d\d\b[^:]*:[^,}]*\b[45]\d\d\b/.test(call); // ternary of two ≥400 codes
    if (!is4xx) continue;
    if (/\bmessage\b/.test(call)) continue; // has message (message: … or shorthand { error, message })
    out.push({ status: literal ? literal[1] : "4xx", snippet: call.slice(0, 80).replace(/\s+/g, " ") });
  }
  return out;
}

describe("import route — every ≥400 response carries a message (T-70)", () => {
  it("the real import route has NO ≥400 response without a message", () => {
    const missing = findResponsesMissingMessage(readFileSync(ROUTE, "utf8"));
    expect(
      missing,
      missing.length
        ? "An import-route error response has no `message`, so the wizard shows its file-blaming " +
            "fallback. Add a message that names the real cause.\nOffenders:\n" +
            missing.map((v) => `  [${v.status}] ${v.snippet}`).join("\n")
        : "",
    ).toEqual([]);
  });

  // ── The guard BITES — proven on synthetic input ──
  it("flags a 401 with no message (the exact T-70 bug)", () => {
    const bad = `return NextResponse.json({ error: "unauthenticated" }, { status: 401 });`;
    expect(findResponsesMissingMessage(bad)).toEqual([{ status: "401", snippet: expect.stringContaining("unauthenticated") }]);
  });

  it("passes a 401 WITH a message", () => {
    const good = `return NextResponse.json({ error: "unauthenticated", message: "Sesi berakhir." }, { status: 401 });`;
    expect(findResponsesMissingMessage(good)).toEqual([]);
  });

  it("passes the { error, message } shorthand", () => {
    const good = `return NextResponse.json({ error: result.error, message }, { status: 400 });`;
    expect(findResponsesMissingMessage(good)).toEqual([]);
  });

  it("passes the import route's 422/400 ternary (shorthand message)", () => {
    const good = `NextResponse.json({ error: result.error, message }, { status: x === "y" ? 422 : 400 });`;
    expect(findResponsesMissingMessage(good)).toEqual([]);
  });

  it("does NOT flag a 200 success without a message", () => {
    const ok = `return NextResponse.json(trimmed, { headers: { "Cache-Control": "no-store" } });`;
    expect(findResponsesMissingMessage(ok)).toEqual([]);
  });
});
