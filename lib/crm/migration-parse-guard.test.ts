import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, parsePlPgSQL } from "libpg-query";

/**
 * GUARD (pagar keenam): every file in supabase/migrations/ must PARSE — both as SQL and,
 * where it contains PL/pgSQL, as PL/pgSQL.
 *
 * WHY THIS TEST EXISTS — read before "fixing" a failure by weakening it:
 *
 * On 7 Sep 2026 migration 37 was carried all the way to an owner review gate and REJECTED by
 * production on its first apply:
 *
 *     ERROR: 42601: syntax error at or near "tag_targets"
 *
 * One missing comma. The CTE `ins` was closed with `)` instead of `),` — six comment lines
 * above the CTE that followed it, which is exactly where a human eye slides past. That file
 * could not have been created in ANY database, and nothing in this repo knew.
 *
 * It is one layer EARLIER than T-48. T-48 says: a successful `CREATE FUNCTION` proves the
 * function EXISTS, not that it RUNS (PL/pgSQL resolves table and column names lazily, at first
 * execution). This says: the migration file was never proven to even PARSE. The three parity
 * tests guarding that same file — tags, consent-vocabulary, dedup — all passed with the missing
 * comma still in place, because they scan SOURCE TEXT to prove the TypeScript rule and the SQL
 * rule agree. Not one of them pretends to be a SQL parser. That is not their failure; it is
 * their scope. This test is the missing scope.
 *
 * WHY BOTH PARSERS, AND WHY parse_sql ALONE IS WORTHLESS HERE. A PL/pgSQL body is a
 * dollar-quoted STRING literal. The outer SQL grammar never looks inside it. Measured on the
 * exact broken file:
 *
 *     parse_sql      broken -> OK        <- blind
 *     parse_sql      fixed  -> OK
 *     parse_plpgsql  broken -> syntax error at or near "tag_targets"
 *     parse_plpgsql  fixed  -> OK
 *
 * So `parse` catches a malformed statement OUTSIDE a function body, and `parsePlPgSQL` catches
 * one INSIDE it. Dropping either half leaves a real hole. Stopping at `parse` and reporting
 * "verified" would have been the same failure class this whole guard exists to close.
 *
 * WHY NOT A REAL SERVER. An earlier proposal was to `initdb` a throwaway Postgres in CI and run
 * `psql -f` over each file. That works — it is how the migration-37 comma was actually isolated —
 * but it needs a server, a CI decision, and seconds per run. libpg-query is Postgres's OWN
 * grammar compiled to a library: same parser, same error text, milliseconds, no server. It sits
 * at the same weight as the other five guards.
 *
 * WHAT THIS GUARD DOES **NOT** PROVE — do not read a green run as more than it is:
 *   - NOT that table or column names exist, or that types line up. PL/pgSQL resolves those at
 *     first execution, which is precisely T-48. Only a real call against the real schema shows
 *     that, and that belongs in the apply gate, not here.
 *   - NOT that the migration does what it says. A syntactically perfect migration can still
 *     delete the wrong rows.
 *   - NOT an exact version match. libpg-query 18 carries the PostgreSQL 18 grammar; the shared
 *     Supabase runs its own version. For statement and PL/pgSQL structure the grammars agree,
 *     and the message this guard prints for the migration-37 comma is character-for-character
 *     what production returned. A version-specific syntax could in principle diverge; if this
 *     guard ever disagrees with the server, THE SERVER IS RIGHT.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

describe("pagar: setiap berkas migrasi harus bisa diurai", () => {
  const files = migrationFiles();

  it("ada berkas migrasi untuk dijaga (pagar yang menjaga nol berkas selalu hijau)", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files)("%s — parse_sql (statement di LUAR badan fungsi)", async (file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await expect(parse(sql)).resolves.toBeDefined();
  });

  it.each(files)("%s — parse_plpgsql (statement di DALAM badan fungsi)", async (file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await expect(parsePlPgSQL(sql)).resolves.toBeDefined();
  });

  /**
   * The guard must be proven to BITE, not merely to be green. This reconstructs the exact
   * migration-37 defect — the comma that closed CTE `ins` — and asserts that parse_plpgsql
   * rejects it while parse_sql waves it through. If someone ever swaps this guard for a
   * parse-only check, this case fails and says why.
   */
  it("menggigit: koma yang hilang antar-CTE ditolak parse_plpgsql, TAPI lolos parse_sql", async () => {
    const rusak = `
create or replace function public.uji_pagar_keenam(p jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v int;
begin
  with a as (
    select 1 as x
  )
  b as (
    select 2 as y
  )
  select (select count(*) from a) into v;
  return jsonb_build_object('v', v);
end $$;
`;
    // Badan PL/pgSQL adalah literal berkutip dolar — tata bahasa SQL luar tak melihat ke dalamnya.
    await expect(parse(rusak)).resolves.toBeDefined();
    await expect(parsePlPgSQL(rusak)).rejects.toThrow(/syntax error/i);
  });

  it("menggigit: statement rusak di LUAR badan fungsi ditolak parse_sql", async () => {
    await expect(parse("create table public.uji ( id uuid,, );")).rejects.toThrow(/syntax error/i);
  });
});
