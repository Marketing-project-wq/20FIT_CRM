import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD (T-69, 8 Sep 2026): a Supabase QUERY read must capture `error`, not discard it.
 *
 * WHY THIS TEST EXISTS — read before "fixing" a failure by adding to the allowlist:
 * `const { data } = await admin.from(t).select(...).in(...)` throws away the `{ error }` half of the
 * PostgREST result. When the query fails — and it CAN fail on a perfectly valid request: a `.in(list)`
 * whose list is long enough to push the request URL past the gateway's ~24 KB limit returns HTTP 400 —
 * supabase-js returns `{ data: null, error }`, the code reads only `data` (null), and the caller
 * proceeds as if the table were EMPTY. In the CSV import that meant every row looked net-new, the
 * ingest anti-join silently skipped everyone already in the pool, and 1.432-row files imported ~half
 * with ZERO tagging under a green "Impor selesai" check. A failed read that reports success is the
 * exact class this project spent ten rounds closing on the SEND path (T-41/T-54); this guard keeps it
 * from re-appearing on a READ path unnoticed.
 *
 * THE RULE: if you destructure `data` from an awaited `.from(…).<verb>(…)` query, also destructure
 * `error` and act on it. To read without caring about failure is a deliberate act that must be VISIBLE
 * — so it goes in KNOWN_UNCHECKED_READS below, in the same commit, where a reviewer sees it. That list
 * MAY ONLY SHRINK: it is the 19 pre-existing best-effort reads inherited when this guard was written
 * (mostly campaign/send/workflow paths that already tolerate a null read). New ones are not allowed.
 *
 * SCOPE + LIMITS (honest): the analyzer only sees a `.from(` chain inside the SAME statement as the
 * destructure. A read built from a pre-made query variable (`const { data } = await q.maybeSingle()`)
 * is not seen — a real gap, documented, not hidden. `.auth.getUser()` (fail-closed to 401) and
 * `storage…getPublicUrl` (no `error` field) are excluded by construction.
 */

const BASE = join(process.cwd());
const VERB =
  /\.(select|in|eq|neq|order|maybeSingle|single|limit|contains|is|gte|lte|gt|lt|match|range|overlaps|filter)\s*\(/;

export interface ReadSite {
  path: string; // repo-relative
  bind: string; // the identifier `data` is aliased to (or "data")
  table: string; // the .from("…") table
}

/** Strip TS comments so a commented-out example never scans as live code. */
export function stripTsComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Pure analyzer: every `const { data[, …] } = await …from(t).<verb>(…)` that does NOT bind `error`. */
export function findUncheckedReads(files: { path: string; content: string }[]): ReadSite[] {
  const out: ReadSite[] = [];
  const re = /const\s*\{([^}]*)\}\s*=\s*(?:await\s+)?([^;]*);/g;
  for (const f of files) {
    const content = stripTsComments(f.content);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const binding = m[1];
      const expr = m[2];
      if (!/\bdata\b/.test(binding)) continue;
      if (/\berror\b/.test(binding)) continue; // the correct shape — not a swallow
      if (!/\.from\s*\(/.test(expr)) continue; // not a PostgREST query
      if (!VERB.test(expr)) continue; // .from() without a query verb (e.g. storage.from)
      if (/\.auth\.getUser|getPublicUrl/.test(expr)) continue; // fail-closed / no error field
      const table = (expr.match(/\.from\s*\(\s*["'`]([^"'`]+)["'`]/) || [])[1] || "?";
      const bind = (binding.match(/data(?:\s*:\s*(\w+))?/) || [])[1] || "data";
      out.push({ path: f.path, bind, table });
    }
  }
  return out;
}

const key = (s: ReadSite) => `${s.path}|${s.bind}|${s.table}`;

/**
 * The 19 pre-existing swallow sites inherited when this guard was written (18 unique signatures —
 * deliveries' `profs|master_customer` appears twice). MAY ONLY SHRINK: fix one → remove its line here,
 * in the same commit. These are best-effort reads on campaign/send/workflow paths that already tolerate
 * a null read; each is a candidate for the same throw-on-error fix the import path just got (T-69).
 */
export const KNOWN_UNCHECKED_READS: ReadonlySet<string> = new Set([
  "lib/crm/deliveries.ts|profs|master_customer",
  "lib/crm/deliveries.ts|runData|crm_campaign_run",
  "lib/crm/deliveries.ts|logData|crm_message_log",
  "lib/crm/deliveries.ts|auditData|crm_audit_log",
  "lib/crm/scheduled-send.ts|due|crm_scheduled_send",
  "lib/crm/send-test-harness.ts|existing|crm_message_template",
  "lib/crm/send-test-harness.ts|existing|crm_segment",
  "lib/crm/send-test-harness.ts|logs|crm_message_log",
  "app/(app)/campaigns/actions.ts|data|crm_message_template",
  "app/(app)/campaigns/actions.ts|data|crm_campaign_run",
  "app/(app)/campaigns/actions.ts|tplData|crm_message_template",
  "app/(app)/campaigns/actions.ts|data|crm_test_recipient",
  "app/(app)/templates/brand-asset-actions.ts|data|crm_brand_asset",
  "app/(app)/workflows/actions.ts|existing|crm_workflow_enrollment",
  "app/(app)/workflows/actions.ts|queued|crm_workflow_enrollment",
  "app/(app)/workflows/actions.ts|profs|master_customer",
  "app/api/audience/[id]/route.ts|he|crm_audit_log",
  "app/api/templates/route.ts|existing|crm_message_template",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "node_modules" || e === ".next") continue;
      walk(p, out);
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

function readServerFiles(): { path: string; content: string }[] {
  return walk(join(BASE, "lib"))
    .concat(walk(join(BASE, "app")))
    .map((p) => ({ path: p.replace(BASE + "/", ""), content: readFileSync(p, "utf8") }));
}

describe("Supabase read-error swallow guard (T-69)", () => {
  const files = readServerFiles();

  it("scans a real, non-trivial server tree", () => {
    expect(files.length).toBeGreaterThanOrEqual(50);
  });

  it("the import loadKeys reads are FIXED — no import-route swallow remains", () => {
    const importSwallows = findUncheckedReads(files).filter((s) =>
      s.path.endsWith("audience/import/route.ts"),
    );
    expect(importSwallows).toEqual([]);
  });

  it("no NEW unchecked read exists outside the frozen allowlist", () => {
    const violations = findUncheckedReads(files).filter((s) => !KNOWN_UNCHECKED_READS.has(key(s)));
    expect(
      violations,
      violations.length
        ? "A Supabase query read discards `error`. On failure (e.g. a `.in()` URL over the gateway " +
            "limit → HTTP 400) supabase-js returns { data: null, error } and this code treats the " +
            "table as empty — a failed read reported as success (T-69). Capture `error` and act on " +
            "it, or, for a deliberate best-effort read, add it to KNOWN_UNCHECKED_READS.\nOffenders:\n" +
            violations.map((v) => `  ${key(v)}`).join("\n")
        : "",
    ).toEqual([]);
  });

  it("the allowlist may only SHRINK — every entry still exists in the tree (no stale exemptions)", () => {
    const real = new Set(findUncheckedReads(files).map(key));
    const stale = Array.from(KNOWN_UNCHECKED_READS).filter((k) => !real.has(k));
    expect(stale, stale.length ? `Remove fixed/again-checked reads from KNOWN_UNCHECKED_READS:\n${stale.join("\n")}` : "").toEqual([]);
  });

  // ── The guard BITES — proven on synthetic input ──
  it("flags a query read that discards error", () => {
    const bad = 'const { data } = await admin.from("master_customer").in("email_normalized", emails);';
    expect(findUncheckedReads([{ path: "bad.ts", content: bad }])).toEqual([
      { path: "bad.ts", bind: "data", table: "master_customer" },
    ]);
  });

  it("passes the correct { data, error } shape", () => {
    const good = 'const { data, error } = await admin.from("master_customer").select("x").in("email_normalized", emails);';
    expect(findUncheckedReads([{ path: "ok.ts", content: good }])).toEqual([]);
  });

  it("passes an aliased { data: x, error } shape", () => {
    const good = 'const { data: rows, error: e } = await admin.from("crm_segment").select("id");';
    expect(findUncheckedReads([{ path: "ok.ts", content: good }])).toEqual([]);
  });

  it("does NOT flag auth.getUser (fail-closed) or storage getPublicUrl (no error field)", () => {
    const auth = "const { data } = await supabase.auth.getUser();";
    const pub = "const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);";
    expect(findUncheckedReads([{ path: "a.ts", content: auth + "\n" + pub }])).toEqual([]);
  });

  it("does NOT flag a commented-out example", () => {
    const commented = '// const { data } = await admin.from("master_customer").select("x").in("e", xs);';
    expect(findUncheckedReads([{ path: "c.ts", content: commented }])).toEqual([]);
  });
});
