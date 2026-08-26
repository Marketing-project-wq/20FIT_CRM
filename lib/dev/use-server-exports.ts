/**
 * GUARD (T-32 class): a module with a top-level `"use server"` directive may export ONLY async
 * functions. A value export from such a module (`export const ROLES = […]`) compiles and builds green
 * — its TYPE is correct — but at runtime it becomes an empty stub on the client, so `ROLES.map(…)`
 * throws on first render. `tsc`, `next lint`, and `next build` never catch it; only rendering does.
 *
 * This is the same technique the repo already uses for the reset-password and translation classes: a
 * source scan that fails the build for the whole CLASS, so the next server-action file can't reintroduce
 * it. Pure (no I/O) so the pieces are unit-testable; the test walks the repo and feeds real files in.
 *
 * Allowed exports in a "use server" module:
 *   - `export async function …`            (a server action — the only runtime value that survives)
 *   - `export type …` / `export interface` (erased at compile time — no runtime value)
 * Flagged:
 *   - `export const | let | var | enum …`  (a runtime VALUE — the T-32 stub)
 *   - `export function …` (sync)           (server actions must be async)
 *   - `export default …` (non-async-fn)    (same stub risk)
 * `export { … }` re-exports and `export *` are left alone (ambiguous — may re-export async actions);
 * the T-32 class is direct value declarations, which ARE caught.
 */

export interface UseServerViolation {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

const DIRECTIVE = /^["']use server["'];?$/;

function isComment(line: string): boolean {
  return line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");
}

/** True when the file's FIRST real statement is a `"use server"` directive (a module-level server file,
 *  not an inline function-scoped `"use server"`). */
export function isUseServerModule(source: string): boolean {
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || isComment(line)) continue;
    return DIRECTIVE.test(line);
  }
  return false;
}

export function scanUseServerExports(source: string, file: string): UseServerViolation[] {
  if (!isUseServerModule(source)) return [];
  const out: UseServerViolation[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (isComment(line) || !line.startsWith("export")) continue;

    // Allowed forms — skip.
    if (/^export\s+async\s+function\s/.test(line)) continue;
    if (/^export\s+(type|interface)\b/.test(line)) continue;
    if (/^export\s+default\s+async\s+function\b/.test(line)) continue;

    // Flagged forms.
    if (/^export\s+(const|let|var|enum)\s/.test(line)) {
      out.push({ file, line: i + 1, snippet: line, reason: "value export (const/let/var/enum) becomes an empty client stub" });
    } else if (/^export\s+function\s/.test(line)) {
      out.push({ file, line: i + 1, snippet: line, reason: "sync function export — a server action must be async" });
    } else if (/^export\s+default\b/.test(line)) {
      out.push({ file, line: i + 1, snippet: line, reason: "default export must be an async function" });
    }
  }
  return out;
}
