import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD: every `crm_*` function created in a migration must LOCK its EXECUTE grant in
 * the SAME migration file — revoked from `public`, `anon`, AND `authenticated`.
 *
 * WHY THIS TEST EXISTS — read before "fixing" a failure by weakening it:
 * Supabase auto-grants EXECUTE to `anon` and `authenticated` (and PUBLIC) on EVERY new
 * function in schema `public`. A `SECURITY DEFINER` function runs as its owner (postgres),
 * so an anon-key holder who can reach it via `POST /rest/v1/rpc/<fn>` executes owner-level
 * code with NO login and NO role — bypassing all RBAC. And `revoke ... from public` alone
 * is NOT enough: anon/authenticated are EXPLICIT per-role grants, not inherited via PUBLIC,
 * so they survive a public-only revoke. This actually shipped: crm_purge_audit_log (which
 * disables the append-only trigger and deletes audit rows) was anon-callable from Sprint 3A
 * until migration 10 closed it. This guard makes the next such omission fail a test.
 *
 * SCOPE — `crm_*` ONLY, on purpose. This repo's `supabase/migrations/` holds only this
 * project's crm_* migrations; other teams (arena / clinic / shop / rb / my20fit / rc /
 * uob / talent) apply their own migrations to the SAME shared Supabase from their own
 * repos — ~99 of their SECURITY DEFINER functions are anon-executable in the live DB but
 * their SQL is not here and is NOT ours to change (see docs/RISIKO-rpc-execute-terbuka.md).
 * The crm_* filter is belt-and-suspenders: it keeps the guard correct even if a non-crm
 * function is ever added to this repo. We guard our own surface and document the rest.
 *
 * TWO documented exemptions:
 *   1. Functions that `returns trigger` — PostgREST refuses to expose trigger-returning
 *      functions as RPC endpoints, so there is no HTTP path to call them; and they are
 *      SECURITY INVOKER (no privilege elevation). Their open EXECUTE is inert.
 *   2. A named cross-file allowlist — a function created BEFORE this rule whose lock lives
 *      in a later migration (crm_purge_audit_log: created in migration 8, locked in 10).
 *      New functions do NOT get this — they must self-lock in-file.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Functions locked by a LATER migration (predate the in-file rule). Documented, finite. */
export const CROSS_FILE_LOCKED = new Set<string>([
  "crm_purge_audit_log", // created migration 8, EXECUTE revoked in migration 10
]);

export interface CrmFnDef {
  name: string;
  file: string;
  returnsTrigger: boolean;
}

/** Find every `create [or replace] function public.crm_*` in one file, with a flag for
 *  whether it returns trigger (checked in the header before the body/`language`). */
export function findCrmFunctionDefs(content: string, file: string): CrmFnDef[] {
  const defs: CrmFnDef[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(crm_\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1];
    // Header window: from this create up to the body start (`as $$` / `language`), capped.
    const rest = content.slice(m.index, m.index + 600);
    const bodyAt = rest.search(/\bas\s+\$|\blanguage\s+/i);
    const header = bodyAt === -1 ? rest : rest.slice(0, bodyAt);
    defs.push({ name, file, returnsTrigger: /returns\s+trigger/i.test(header) });
  }
  return defs;
}

/** Does this file revoke EXECUTE on `name` from public AND anon AND authenticated?
 *  The three roles may be named in ONE statement (`from public, anon, authenticated`) OR across
 *  several statements (`from public;` `from anon;` `from authenticated;`) — both produce the exact
 *  same ACL, so the roles are UNIONed across every revoke naming this function. `public`-only (or
 *  any partial cover) still fails: the union must contain all three. */
export function fileRevokesExecute(content: string, name: string): boolean {
  const re = new RegExp(
    `revoke\\s+(?:all|execute)\\b[^;]*?on\\s+function\\s+public\\.${name}\\s*\\([^)]*\\)\\s+from\\s+([^;]+);`,
    "gis",
  );
  const roles = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const from = m[1].toLowerCase();
    for (const r of ["public", "anon", "authenticated"]) if (from.includes(r)) roles.add(r);
  }
  return roles.has("public") && roles.has("anon") && roles.has("authenticated");
}

/** Find every `create materialized view public.crm_*` in one file. A matview does NOT honour
 *  RLS, so grants are its ONLY protection (Sprint 5A, migration 15) — the same anon/authenticated
 *  auto-grant hazard as functions, but on SELECT instead of EXECUTE. */
export function findCrmMatviewDefs(content: string, file: string): { name: string; file: string }[] {
  const defs: { name: string; file: string }[] = [];
  const re = /create\s+materialized\s+view\s+(?:if\s+not\s+exists\s+)?public\.(crm_\w+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) defs.push({ name: m[1], file });
  return defs;
}

/** Does this file revoke SELECT (or ALL) on the matview from public AND anon AND authenticated?
 *  Same union-across-statements rule as fileRevokesExecute: one combined revoke or three split
 *  revokes both count; a partial cover (e.g. `public`-only) does not. */
export function fileRevokesSelect(content: string, name: string): boolean {
  const re = new RegExp(
    `revoke\\s+(?:all|select)\\b[^;]*?on\\s+(?:table\\s+)?public\\.${name}\\s+from\\s+([^;]+);`,
    "gis",
  );
  const roles = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const from = m[1].toLowerCase();
    for (const r of ["public", "anon", "authenticated"]) if (from.includes(r)) roles.add(r);
  }
  return roles.has("public") && roles.has("anon") && roles.has("authenticated");
}

/** The matview analyzer — pure, mirrors scanUnlockedCrmFunctions. */
export function scanUnlockedCrmMatviews(files: { path: string; content: string }[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    for (const def of findCrmMatviewDefs(f.content, f.path)) {
      if (!fileRevokesSelect(f.content, def.name)) out.push({ name: def.name, file: f.path });
    }
  }
  return out;
}

export interface Violation {
  name: string;
  file: string;
}

/** The core analyzer — pure, so it can be proven to bite on synthetic input. */
export function scanUnlockedCrmFunctions(
  files: { path: string; content: string }[],
  allowlist: ReadonlySet<string> = CROSS_FILE_LOCKED,
): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    for (const def of findCrmFunctionDefs(f.content, f.path)) {
      if (def.returnsTrigger) continue; // exemption 1: not RPC-exposable
      if (allowlist.has(def.name)) continue; // exemption 2: locked cross-file (documented)
      if (!fileRevokesExecute(f.content, def.name)) out.push({ name: def.name, file: f.path });
    }
  }
  return out;
}

function readMigrations(): { path: string; content: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ path: f, content: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }));
}

const UNLOCKED_MSG =
  "crm_* function created without an in-file EXECUTE lock. Supabase auto-grants EXECUTE " +
  "to anon+authenticated on every new public function, and `revoke ... from public` does " +
  "NOT remove those explicit per-role grants. Add, in the SAME migration file:\n" +
  "  revoke all on function public.<fn>(<args>) from public, anon, authenticated;\n" +
  "  grant execute on function public.<fn>(<args>) to service_role;";

describe("crm_* migration EXECUTE lock guard", () => {
  const files = readMigrations();

  it("scans the real migrations directory (all crm_* files)", () => {
    // This repo owns 10 crm_* migrations today; the count only grows. A near-empty
    // scan would mean the walk silently found nothing and the guard tested air.
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("every crm_* function locks EXECUTE in its own file (or is a documented exemption)", () => {
    const violations = scanUnlockedCrmFunctions(files);
    expect(
      violations,
      violations.length ? `${UNLOCKED_MSG}\nOffenders:\n${violations.map((v) => `  ${v.name} (${v.file})`).join("\n")}` : "",
    ).toEqual([]);
  });

  it("finds the four known crm_* functions across the real migrations", () => {
    const names = new Set(files.flatMap((f) => findCrmFunctionDefs(f.content, f.path)).map((d) => d.name));
    for (const n of [
      "crm_record_suppression",
      "crm_lift_suppression",
      "crm_purge_audit_log",
      "crm_audit_log_no_mutate",
    ]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("every allowlisted name actually exists as a definition (no stale exemptions)", () => {
    const names = new Set(files.flatMap((f) => findCrmFunctionDefs(f.content, f.path)).map((d) => d.name));
    for (const n of Array.from(CROSS_FILE_LOCKED)) expect(names.has(n)).toBe(true);
  });

  // ── The guard BITES — proven on synthetic input (permanent proof it isn't inert) ──
  it("flags a crm_* function with NO revoke", () => {
    const bad = "create function public.crm_evil(x text) returns jsonb language sql as $$ select '{}'::jsonb $$;";
    expect(scanUnlockedCrmFunctions([{ path: "bad.sql", content: bad }], new Set())).toEqual([
      { name: "crm_evil", file: "bad.sql" },
    ]);
  });

  it("passes a crm_* function that DOES revoke from public+anon+authenticated", () => {
    const good =
      "create function public.crm_ok(x text) returns jsonb language sql as $$ select '{}'::jsonb $$;\n" +
      "revoke all on function public.crm_ok(text) from public, anon, authenticated;\n" +
      "grant execute on function public.crm_ok(text) to service_role;";
    expect(scanUnlockedCrmFunctions([{ path: "ok.sql", content: good }], new Set())).toEqual([]);
  });

  it("does NOT flag a revoke that misses anon (public-only is insufficient)", () => {
    const partial =
      "create function public.crm_half(x text) returns jsonb language sql as $$ select '{}'::jsonb $$;\n" +
      "revoke all on function public.crm_half(text) from public;";
    expect(scanUnlockedCrmFunctions([{ path: "half.sql", content: partial }], new Set())).toHaveLength(1);
  });

  it("passes a function locked with THREE split revokes (equivalent to one combined revoke)", () => {
    // migrations 16/17 were pulled verbatim from PR #13 and use the split form; it is the same ACL.
    const split =
      "create or replace function public.crm_split(x text) returns text language sql as $$ select x $$;\n" +
      "revoke all on function public.crm_split(text) from public;\n" +
      "revoke all on function public.crm_split(text) from anon;\n" +
      "revoke all on function public.crm_split(text) from authenticated;\n" +
      "grant execute on function public.crm_split(text) to service_role;";
    expect(scanUnlockedCrmFunctions([{ path: "split.sql", content: split }], new Set())).toEqual([]);
  });

  it("STILL flags split revokes that cover only public+anon (authenticated missing)", () => {
    const partialSplit =
      "create function public.crm_two(x text) returns text language sql as $$ select x $$;\n" +
      "revoke all on function public.crm_two(text) from public;\n" +
      "revoke all on function public.crm_two(text) from anon;";
    expect(scanUnlockedCrmFunctions([{ path: "two.sql", content: partialSplit }], new Set())).toHaveLength(1);
  });

  it("exempts trigger-returning functions (not RPC-exposable)", () => {
    const trig = "create function public.crm_trg() returns trigger language plpgsql as $$ begin return null; end $$;";
    expect(scanUnlockedCrmFunctions([{ path: "trg.sql", content: trig }], new Set())).toEqual([]);
  });
});

/**
 * GUARD (Sprint 5A, migration 15): a `crm_*` materialized view does NOT honour RLS, so its SELECT
 * grant is its ONLY protection. Supabase auto-grants SELECT to anon/authenticated on new public
 * relations, so every crm_* matview must revoke SELECT from public+anon+authenticated in the SAME
 * file — the direct-ACL check the data owner required before sign-off.
 */
describe("crm_* materialized view SELECT lock guard", () => {
  const files = readMigrations();

  it("every crm_* materialized view locks SELECT in its own file", () => {
    const violations = scanUnlockedCrmMatviews(files);
    expect(
      violations,
      violations.length
        ? "crm_* materialized view created without an in-file SELECT lock. A matview ignores RLS, " +
            "so grants are its only protection. Add, in the SAME migration file:\n" +
            "  revoke all on public.<matview> from public, anon, authenticated;\n" +
            "  grant select on public.<matview> to service_role;\nOffenders:\n" +
            violations.map((v) => `  ${v.name} (${v.file})`).join("\n")
        : "",
    ).toEqual([]);
  });

  it("finds crm_customer_mirror in the real migrations", () => {
    const names = new Set(files.flatMap((f) => findCrmMatviewDefs(f.content, f.path)).map((d) => d.name));
    expect(names.has("crm_customer_mirror")).toBe(true);
  });

  // ── The guard BITES — proven on synthetic input ──
  it("flags a crm_* matview with NO revoke", () => {
    const bad = "create materialized view public.crm_leak as select 1 as x with data;";
    expect(scanUnlockedCrmMatviews([{ path: "bad.sql", content: bad }])).toEqual([
      { name: "crm_leak", file: "bad.sql" },
    ]);
  });

  it("passes a crm_* matview that DOES revoke from public+anon+authenticated", () => {
    const good =
      "create materialized view public.crm_ok_mv as select 1 as x with data;\n" +
      "revoke all on public.crm_ok_mv from public, anon, authenticated;\n" +
      "grant select on public.crm_ok_mv to service_role;";
    expect(scanUnlockedCrmMatviews([{ path: "ok.sql", content: good }])).toEqual([]);
  });

  it("does NOT pass a matview revoke that misses anon (public-only is insufficient)", () => {
    const partial =
      "create materialized view public.crm_half_mv as select 1 as x with data;\n" +
      "revoke all on public.crm_half_mv from public;";
    expect(scanUnlockedCrmMatviews([{ path: "half.sql", content: partial }])).toHaveLength(1);
  });

  it("passes a matview locked with THREE split revokes (migration 16 form, verbatim from PR #13)", () => {
    const split =
      "create materialized view public.crm_split_mv as select 1 as x with data;\n" +
      "revoke all on public.crm_split_mv from public;\n" +
      "revoke all on public.crm_split_mv from anon;\n" +
      "revoke all on public.crm_split_mv from authenticated;\n" +
      "grant select on public.crm_split_mv to service_role;";
    expect(scanUnlockedCrmMatviews([{ path: "split.sql", content: split }])).toEqual([]);
  });
});
