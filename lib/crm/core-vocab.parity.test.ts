import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEGMENT_VALUES,
  FIRST_UNIT_VALUES,
  FIRST_UNIT_DROPDOWN_VALUES,
  isSegmentValue,
  isFirstUnitValue,
} from "./core-vocab";

/**
 * PARITAS kosakata inti:  daftar TypeScript (core-vocab.ts)  ⇄  IN(...) di dalam
 * crm_update_master_fields.  The dropdown reads the TS list; the RPC validates with the SQL list.
 * If they drift, the operator picks a value the RPC then rejects — a failure they were told could
 * not happen. This is the tag/consent class (T-51), guarded the same way: compared value for value,
 * FAIL-CLOSED — if the migration cannot be parsed for either list, the test fails rather than passing
 * on nothing.
 */

const MIGRATION = join(process.cwd(), "supabase", "migrations", "20260908052000_crm_update_master_fields.sql");
const sql = () => readFileSync(MIGRATION, "utf8");

/** Pull the value list out of a `p_<col> not in ('a','b',...)` guard. Returns null (→ fail-closed)
 *  when the guard is not found at all — a renamed guard must break the test, not silently pass. */
function sqlInList(body: string, col: string): string[] | null {
  const m = new RegExp(`p_${col} not in \\(([^)]*)\\)`).exec(body);
  if (!m) return null;
  return Array.from(m[1].matchAll(/'([^']*)'/g)).map((x) => x[1]);
}

describe("core-vocab — TS canon ⇄ SQL IN(...) list, fail-closed", () => {
  it("segment: the SQL guard exists and matches SEGMENT_VALUES exactly", () => {
    const list = sqlInList(sql(), "segment");
    expect(list, "the `p_segment not in (...)` guard must exist in the migration").not.toBeNull();
    expect([...(list as string[])].sort()).toEqual([...SEGMENT_VALUES].sort());
  });

  it("first_unit: the SQL guard exists and matches FIRST_UNIT_VALUES exactly", () => {
    const list = sqlInList(sql(), "first_unit");
    expect(list, "the `p_first_unit not in (...)` guard must exist in the migration").not.toBeNull();
    expect([...(list as string[])].sort()).toEqual([...FIRST_UNIT_VALUES].sort());
  });

  it("20fit_data is ACCEPTED by SQL but NOT offered in the dropdown (T3)", () => {
    expect(sqlInList(sql(), "first_unit")).toContain("20fit_data");
    expect(FIRST_UNIT_DROPDOWN_VALUES).not.toContain("20fit_data");
    // the dropdown is otherwise the full accepted set
    expect([...FIRST_UNIT_DROPDOWN_VALUES, "20fit_data"].sort()).toEqual([...FIRST_UNIT_VALUES].sort());
  });

  it("the type guards accept every canon value and reject an unknown one", () => {
    for (const v of SEGMENT_VALUES) expect(isSegmentValue(v)).toBe(true);
    for (const v of FIRST_UNIT_VALUES) expect(isFirstUnitValue(v)).toBe(true);
    expect(isSegmentValue("vip")).toBe(false);
    expect(isFirstUnitValue("padel")).toBe(false);
  });
});
