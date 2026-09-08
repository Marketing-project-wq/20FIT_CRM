import { describe, it, expect, vi } from "vitest";
import { runImportRequest, type ImportDeps } from "./import-audience-run";
import type { ImportKeys } from "./import-audience";

const emptyKeys: ImportKeys = {
  existingEmails: new Set(),
  taggableEmails: new Set(),
  existingPhones: new Set(),
  suppressedEmails: new Set(),
  suppressedPhones: new Set(),
};

function makeDeps(over: Partial<ImportDeps> = {}) {
  return {
    loadKeys: vi.fn(async () => emptyKeys),
    commit: vi.fn(async () => ({ inserted: 0, taggedExisting: 0, sharedPhoneInBatch: 0 })),
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
    const commit = vi.fn(async (_rows: unknown, _meta: unknown) => ({ inserted: 2, taggedExisting: 0, sharedPhoneInBatch: 0 }));
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

  // A (T-70): "nothing_to_import" must gate on insert AND tag, not insert alone. A file whose every
  // row is already in the pool has 0 inserts but N tags — legitimate work (K-58, the T-67 button bug
  // mirrored on the error path). 0 masuk + N ditandai must SUCCEED.
  it("execute SUCCEEDS on a tag-only import (0 inserts, N existing tagged)", async () => {
    // Both rows already exist and are taggable → planImport yields 0 insertRows, 2 tagTargets.
    const existingKeys: ImportKeys = {
      existingEmails: new Set(["a@x.com", "b@x.com"]),
      taggableEmails: new Set(["a@x.com", "b@x.com"]),
      existingPhones: new Set(),
      suppressedEmails: new Set(),
      suppressedPhones: new Set(),
    };
    const commit = vi.fn(async () => ({ inserted: 0, taggedExisting: 2, sharedPhoneInBatch: 0 }));
    const deps = makeDeps({ loadKeys: vi.fn(async () => existingKeys), commit });
    const res = await runImportRequest({ phase: "execute", headers, rows, collectionSource: "Sportfest 2" }, deps);
    expect(res.ok).toBe(true); // NOT nothing_to_import — tagging is work
    if (res.ok) {
      expect(res.plan?.summary.netInsert).toBe(0);
      expect(res.plan?.summary.taggedExisting).toBe(2);
    }
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("execute REFUSES nothing_to_import only when BOTH insert and tag are empty", async () => {
    // Rows with no usable email → 0 inserts AND 0 tags → genuinely nothing to do.
    const deps = makeDeps();
    const blank = [{ name: "A", email: "" }, { name: "B", email: "   " }];
    const res = await runImportRequest({ phase: "execute", headers, rows: blank, collectionSource: "X" }, deps);
    expect(res).toEqual({ ok: false, error: "nothing_to_import" });
    expect(deps.commit).not.toHaveBeenCalled();
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

  // TUGAS 4 (T-69) — HARD ATOMIC. loadKeys runs BEFORE commit, so a read failure must abort with ZERO
  // writes. This is the whole point of making loadKeys throw: the old swallow returned empty keys and
  // let commit run on a corrupted plan (a half import). A throw here must never reach commit/audit.
  it("execute writes NOTHING when loadKeys throws (read failure is hard-atomic)", async () => {
    const err = Object.assign(new Error("loadImportKeys email read failed"), { code: "read_failed" });
    const deps = makeDeps({ loadKeys: vi.fn(async () => { throw err; }) });
    await expect(
      runImportRequest({ phase: "execute", headers, rows, collectionSource: "Sportfest 2", filename: "p.csv" }, deps),
    ).rejects.toMatchObject({ code: "read_failed" });
    expect(deps.commit).not.toHaveBeenCalled(); // the WRITE never happens
    expect(deps.audit).not.toHaveBeenCalled(); // no audit row claiming success
  });
});
