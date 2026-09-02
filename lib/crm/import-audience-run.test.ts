import { describe, it, expect, vi } from "vitest";
import { runImportRequest, type ImportDeps } from "./import-audience-run";
import type { ImportKeys } from "./import-audience";

const emptyKeys: ImportKeys = {
  existingEmails: new Set(),
  existingPhones: new Set(),
  suppressedEmails: new Set(),
  suppressedPhones: new Set(),
};

function makeDeps(over: Partial<ImportDeps> = {}) {
  return {
    loadKeys: vi.fn(async () => emptyKeys),
    commit: vi.fn(async () => ({ inserted: 0 })),
    audit: vi.fn(async () => {}),
    ...over,
  } satisfies ImportDeps;
}

const headers = ["name", "email"];
const rows = [
  { name: "A", email: "a@x.com" },
  { name: "B", email: "b@x.com" },
];

describe("runImportRequest — dry-run writes NOTHING", () => {
  it("dry_run loads keys and plans, but never calls commit or audit", async () => {
    const deps = makeDeps();
    const res = await runImportRequest({ phase: "dry_run", headers, rows }, deps);
    expect(res.ok).toBe(true);
    expect(deps.loadKeys).toHaveBeenCalledTimes(1); // a read is allowed
    expect(deps.commit).not.toHaveBeenCalled(); // the WRITE never happens
    expect(deps.audit).not.toHaveBeenCalled();
    if (res.ok) expect(res.plan?.summary.netInsert).toBe(2);
  });

  it("analyze touches NO dependency at all (no DB even read)", async () => {
    const deps = makeDeps();
    const res = await runImportRequest({ phase: "analyze", headers, rows }, deps);
    expect(res.ok).toBe(true);
    expect(deps.loadKeys).not.toHaveBeenCalled();
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
    if (res.ok) expect(res.mapping.email).toBe("email");
  });

  it("execute DOES commit + audit exactly once, with the collection source", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- params typed only so mock.calls[0][1] is indexable
    const commit = vi.fn(async (_rows: unknown, _meta: { collectionSource: string; filename: string | null }) => ({ inserted: 2 }));
    const audit = vi.fn(async () => {});
    const res = await runImportRequest(
      { phase: "execute", headers, rows, collectionSource: "Pendaftaran Sportfest 2 — formulir cetak", filename: "peserta.csv" },
      makeDeps({ commit, audit }),
    );
    expect(res.ok).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][1]).toMatchObject({ collectionSource: "Pendaftaran Sportfest 2 — formulir cetak", filename: "peserta.csv" });
  });

  it("execute REFUSES (and writes nothing) when the collection source is blank", async () => {
    const deps = makeDeps();
    const res = await runImportRequest({ phase: "execute", headers, rows, collectionSource: "   " }, deps);
    expect(res).toEqual({ ok: false, error: "collection_source_required" });
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("rejects an over-cap file before touching any dependency", async () => {
    const deps = makeDeps();
    const big = Array.from({ length: 20_001 }, (_, i) => ({ name: "x", email: `x${i}@y.com` }));
    const res = await runImportRequest({ phase: "dry_run", headers, rows: big }, deps);
    expect(res).toEqual({ ok: false, error: "too_many_rows" });
    expect(deps.loadKeys).not.toHaveBeenCalled();
  });

  it("rejects when no column is mapped to email", async () => {
    const deps = makeDeps();
    const res = await runImportRequest({ phase: "dry_run", headers: ["a", "b"], rows: [{ a: "1", b: "2" }], mapping: { a: "full_name", b: "ignore" } }, deps);
    expect(res).toEqual({ ok: false, error: "no_email_column" });
    expect(deps.loadKeys).not.toHaveBeenCalled();
  });
});
