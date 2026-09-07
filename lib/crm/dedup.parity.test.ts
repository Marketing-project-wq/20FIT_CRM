import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planImport, type ImportKeys, type ColumnMapping } from "./import-audience";

/**
 * PARITAS aturan dedup:  planner murni (import-audience.ts)  ⇄  anti-join di migrasi 37.
 *
 * The dry-run count and what execute actually writes come from TWO implementations of one rule. K-57
 * changed that rule — dedup is EMAIL-PRIMARY, a phone-only match is a DIFFERENT PERSON and is
 * INSERTED — and it had to be changed in both places. If they drift, the operator is shown a number
 * before confirming that is not the number that gets written. That is the same shape as every silent
 * failure in this system's history, and this time we already know what it looks like.
 *
 * Two sides, asserted independently:
 *   BEHAVIOUR — the planner, exercised through real inputs.
 *   TEXT — the SQL anti-join, read from the migration file, because vitest cannot run Postgres.
 */

const MIGRATION = join(process.cwd(), "supabase", "migrations", "20260902050000_crm_ingest_csv_people.sql");

// ColumnMapping maps CSV HEADER -> canonical field (Record<header, ImportField>).
const MAPPING: ColumnMapping = { nama: "full_name", email: "email", telepon: "phone" };

function keys(partial: Partial<ImportKeys> = {}): ImportKeys {
  return {
    existingEmails: new Set<string>(),
    taggableEmails: new Set<string>(),
    existingPhones: new Set<string>(),
    suppressedEmails: new Set<string>(),
    suppressedPhones: new Set<string>(),
    ...partial,
  };
}

describe("dedup parity — the planner side", () => {
  it("an EMAIL match is skipped (identity is unambiguous)", () => {
    const plan = planImport(
      [{ nama: "A", email: "ada@contoh.invalid", telepon: "" }],
      MAPPING,
      keys({
        existingEmails: new Set(["ada@contoh.invalid"]),
        taggableEmails: new Set(["ada@contoh.invalid"]),
      }),
    );
    expect(plan.outcomes[0].status).toBe("skip_duplicate_email");
    expect(plan.insertRows).toHaveLength(0);
  });

  it("a PHONE-ONLY match is INSERTED — a different person is never dropped for sharing a number", () => {
    const plan = planImport(
      [{ nama: "B", email: "budi@contoh.invalid", telepon: "08123456789" }],
      MAPPING,
      keys({ existingPhones: new Set(["628123456789"]) }),
    );
    expect(plan.outcomes[0].status).toBe("insert_shared_phone");
    expect(plan.insertRows).toHaveLength(1);
    expect(plan.summary.sharedPhone).toBe(1);
  });

  it("a phone-only match whose phone is SUPPRESSED is skipped (K-57 opsi d)", () => {
    const plan = planImport(
      [{ nama: "C", email: "cici@contoh.invalid", telepon: "08123456789" }],
      MAPPING,
      keys({
        existingPhones: new Set(["628123456789"]),
        suppressedPhones: new Set(["628123456789"]),
      }),
    );
    expect(plan.outcomes[0].status).toBe("skip_shared_phone_suppressed");
    expect(plan.insertRows).toHaveLength(0);
  });
});

describe("dedup parity — the SQL side must state the SAME rule", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("the anti-join keys on email and NOTHING else", () => {
    const m = /new_people as \(([\s\S]*?)\n  \),/.exec(sql);
    expect(m, "could not find the new_people CTE — extend this test rather than deleting it").toBeTruthy();
    const cte = (m as RegExpExecArray)[1];

    expect(cte, "the email anti-join is the dedup rule").toContain("m.email_normalized = v.ek");
    // THE BITE. Restore the old `and (v.pk is null or not exists (… phone_normalized = v.pk))` and
    // this fails: the SQL would skip a person the planner inserts, so dry-run would over-count and
    // execute would silently write fewer people than the operator was shown.
    expect(
      cte,
      "a phone condition in the anti-join contradicts K-57 and the planner: the dry-run count would " +
        "no longer equal what execute writes",
    ).not.toContain("phone_normalized");
  });

  it("the colliding phone is nulled at write instead — the row survives, the number does not", () => {
    // This is what makes email-only dedup safe: master's phone index is unique, so the phone (not
    // the person) is what gives way.
    const m = /phone_safe as \(([\s\S]*?)\n  \),/.exec(sql);
    expect(m).toBeTruthy();
    const cte = (m as RegExpExecArray)[1];
    expect(cte).toContain("m.phone_normalized = pk");
    expect(cte).toContain("count(*) over (partition by pk) > 1");
  });
});
