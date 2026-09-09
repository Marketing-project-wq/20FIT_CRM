import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "libpg-query";

/**
 * PROOF that the DOUBLE-SEND hard stop lives in the SCHEMA, not just app code (owner request). The
 * app guard (activeSendingRunFor) is best-effort and races under a same-instant double press; the
 * airtight backstop is a PARTIAL UNIQUE INDEX so the DATABASE rejects a second concurrent 'sending'
 * run for one (segment, template).
 *
 * HONEST SCOPE — the same boundary the crm_message_log unique index sits behind. This asserts the
 * index is DEFINED correctly, parsed by Postgres's OWN grammar (libpg-query), not a regex. It does NOT
 * execute an INSERT against a live server — that DB-level *rejection* is proven when the migration is
 * applied at the approved deploy (verifiable read-only against pg_indexes / a rejected duplicate
 * then). What is airtight here: the column is (segment_id, template_key), it is UNIQUE, and it is
 * PARTIAL on status='sending' — so it constrains exactly the in-progress campaign runs, and workflow
 * runs (segment_id NULL, distinct in a unique index) are exempt.
 */

const MIGRATION = join(process.cwd(), "supabase/migrations/20260909060000_crm_campaign_run_add_drain.sql");

// Narrow structural reach into libpg-query's parse tree — enough to read one IndexStmt.
type IndexStmt = {
  unique?: boolean;
  relation?: { relname?: string };
  indexParams?: { IndexElem?: { name?: string } }[];
  whereClause?: unknown;
};

function str(node: unknown): string | undefined {
  return (node as { String?: { sval?: string } })?.String?.sval;
}

describe("crm_campaign_run — partial unique index enforces one 'sending' run per (segment, template)", () => {
  it("is defined in migration 20260909060000, UNIQUE, on (segment_id, template_key), WHERE status='sending'", async () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const ast = (await parse(sql)) as { stmts: { stmt: { IndexStmt?: IndexStmt } }[] };

    const uniqueIndexes = ast.stmts
      .map((s) => s.stmt.IndexStmt)
      .filter((i): i is IndexStmt => !!i && i.unique === true && i.relation?.relname === "crm_campaign_run");

    // Exactly the pair index (the drain_claimed_at index is NOT unique, so it isn't here).
    const pair = uniqueIndexes.find(
      (i) => (i.indexParams ?? []).length === 2,
    );
    expect(pair, "a unique index on crm_campaign_run over two columns must exist").toBeDefined();

    // Columns, in order.
    expect((pair!.indexParams ?? []).map((p) => p.IndexElem?.name)).toEqual(["segment_id", "template_key"]);

    // PARTIAL predicate: status = 'sending' (an A_Expr '=' of column `status` and constant 'sending').
    const w = pair!.whereClause as {
      A_Expr?: { name?: unknown[]; lexpr?: { ColumnRef?: { fields?: unknown[] } }; rexpr?: { A_Const?: { sval?: { sval?: string } } } };
    };
    expect(w?.A_Expr, "the index must be PARTIAL (have a WHERE clause)").toBeDefined();
    expect(str(w.A_Expr!.name?.[0])).toBe("="); // it is an equality predicate
    expect(str(w.A_Expr!.lexpr?.ColumnRef?.fields?.[0])).toBe("status"); // on the status column
    expect(w.A_Expr!.rexpr?.A_Const?.sval?.sval).toBe("sending"); // equal to 'sending'
  });
});
