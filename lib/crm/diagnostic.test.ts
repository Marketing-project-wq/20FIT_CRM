import { describe, it, expect, vi } from "vitest";

// The read layers are `server-only`; stub the marker so this test can import them in node.
vi.mock("server-only", () => ({}));

import { runReadLayerChecks, DIAGNOSTIC_CHECKS } from "./diagnostic";

/**
 * A chainable spy Supabase client. Builder methods return `this`; awaiting a builder
 * resolves to an empty successful result; `.maybeSingle()/.single()` resolve to null.
 * Every operation is recorded as {table, op} so the test can assert what was (not) done.
 */
function spyClient() {
  const ops: { table: string; op: string }[] = [];

  class Builder {
    constructor(public table: string) {}
    private rec(op: string) {
      ops.push({ table: this.table, op });
      return this;
    }
    // read/builder methods — all chainable
    select() { return this.rec("select"); }
    eq() { return this.rec("eq"); }
    neq() { return this.rec("neq"); }
    is() { return this.rec("is"); }
    or() { return this.rec("or"); }
    not() { return this.rec("not"); }
    in() { return this.rec("in"); }
    gt() { return this.rec("gt"); }
    gte() { return this.rec("gte"); }
    lt() { return this.rec("lt"); }
    lte() { return this.rec("lte"); }
    ilike() { return this.rec("ilike"); }
    like() { return this.rec("like"); }
    filter() { return this.rec("filter"); }
    order() { return this.rec("order"); }
    range() { return this.rec("range"); }
    limit() { return this.rec("limit"); }
    // WRITE methods — recorded so the test can prove they never happen
    insert() { return this.rec("insert"); }
    update() { return this.rec("update"); }
    upsert() { return this.rec("upsert"); }
    delete() { return this.rec("delete"); }
    // terminals
    maybeSingle() { this.rec("maybeSingle"); return Promise.resolve({ data: null, error: null }); }
    single() { this.rec("single"); return Promise.resolve({ data: null, error: null }); }
    // make the builder awaitable -> empty successful result
    then(resolve: (v: unknown) => void) {
      resolve({ data: [], count: 0, error: null });
    }
  }

  const client = {
    from(table: string) {
      ops.push({ table, op: "from" });
      return new Builder(table);
    },
    rpc() {
      ops.push({ table: "(rpc)", op: "rpc" });
      return Promise.resolve({ data: null, error: null });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, ops };
}

const WRITE_OPS = new Set(["insert", "update", "upsert", "delete"]);

describe("runReadLayerChecks", () => {
  it("exercises every read layer and reports each ok against the spy", async () => {
    const { client } = spyClient();
    const results = await runReadLayerChecks(client);
    expect(results).toHaveLength(DIAGNOSTIC_CHECKS.length);
    for (const r of results) {
      expect(r.ok, `${r.layer} should pass`).toBe(true);
      expect(typeof r.ms).toBe("number");
    }
  });

  it("writes ZERO rows to crm_audit_log (checks call read layers, not route handlers)", async () => {
    const { client, ops } = spyClient();
    // "audit rows before" = 0 write ops recorded.
    const beforeWrites = ops.filter((o) => o.table === "crm_audit_log" && WRITE_OPS.has(o.op)).length;
    await runReadLayerChecks(client);
    const afterWrites = ops.filter((o) => o.table === "crm_audit_log" && WRITE_OPS.has(o.op)).length;
    // before == after == 0: the diagnostic never inserts audit for the routes it checks.
    expect(beforeWrites).toBe(0);
    expect(afterWrites).toBe(0);
  });

  it("performs NO write op on ANY table (fully read-only)", async () => {
    const { client, ops } = spyClient();
    await runReadLayerChecks(client);
    const writes = ops.filter((o) => WRITE_OPS.has(o.op));
    expect(writes).toEqual([]);
  });

  it("does read crm_audit_log (via fetchAuditLog) — proving the spy is actually exercised", async () => {
    const { client, ops } = spyClient();
    await runReadLayerChecks(client);
    expect(ops.some((o) => o.table === "crm_audit_log" && o.op === "select")).toBe(true);
  });
});
