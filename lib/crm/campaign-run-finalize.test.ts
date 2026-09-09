import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
// finalizeRunFromLog takes `admin` as a param, but campaign-run.ts imports createAdminClient at module
// load, so stub it to keep the import resolvable. The function under test never calls it.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
import { finalizeRunFromLog } from "./campaign-run";

/**
 * PROOF for the P0-3 invariant (#31/#32) on the BACKGROUND path: a run whose failures were in an
 * EARLIER batch but whose FINAL batch was clean must NOT read 'sent'. finalizeRunFromLog reads the
 * WHOLE run log (every batch), so the terminal status reflects all of it — this is what drainRunOnce
 * calls on 'done' instead of the last batch's summary. Driven by a fake admin so the whole-log rule is
 * provable with no DB.
 */
interface Store {
  sentCount: number; // rows with status sent/delivered
  failedCount: number; // rows with status failed/bounced
  readError?: boolean;
  updateError?: boolean;
  updates: { status: string }[];
}

class FakeQuery {
  private op: "select" | "update" = "select";
  private statusIn: string[] | null = null;
  private updateData: { status: string } | null = null;
  constructor(private store: Store, private table: string) {}
  select() { return this; }
  update(data: { status: string }) { this.op = "update"; this.updateData = data; return this; }
  eq() { return this; }
  in(_col: string, list: string[]) { this.statusIn = list; return this; }
  private result(): { count: number | null; error: unknown } {
    if (this.op === "update") {
      if (!this.store.updateError && this.updateData) this.store.updates.push(this.updateData);
      return { count: null, error: this.store.updateError ? { message: "update boom" } : null };
    }
    if (this.store.readError) return { count: null, error: { message: "read boom" } };
    const isSent = (this.statusIn ?? []).includes("sent");
    return { count: isSent ? this.store.sentCount : this.store.failedCount, error: null };
  }
  then<R>(onF: (v: { count: number | null; error: unknown }) => R): Promise<R> {
    return Promise.resolve(this.result()).then(onF);
  }
}

function fakeAdmin(store: Store) {
  return { from: (t: string) => new FakeQuery(store, t) } as never;
}

describe("finalizeRunFromLog — terminal status from the WHOLE run log (latar invariant)", () => {
  it("failures in ANY batch → 'partial' when something also sent (never 'sent')", async () => {
    const store: Store = { sentCount: 850, failedCount: 150, updates: [] };
    const next = await finalizeRunFromLog(fakeAdmin(store), "run1");
    expect(next).toBe("partial");
    expect(store.updates.at(-1)).toEqual({ status: "partial" }); // and it is WRITTEN, visible in Kiriman
  });

  it("everything failed, nothing sent → 'failed'", async () => {
    const store: Store = { sentCount: 0, failedCount: 5, updates: [] };
    expect(await finalizeRunFromLog(fakeAdmin(store), "run1")).toBe("failed");
    expect(store.updates.at(-1)).toEqual({ status: "failed" });
  });

  it("a clean run → 'sent'", async () => {
    const store: Store = { sentCount: 900, failedCount: 0, updates: [] };
    expect(await finalizeRunFromLog(fakeAdmin(store), "run1")).toBe("sent");
    expect(store.updates.at(-1)).toEqual({ status: "sent" });
  });

  it("a FAILED count read never files the run 'sent' — returns null, writes nothing", async () => {
    const store: Store = { sentCount: 0, failedCount: 0, readError: true, updates: [] };
    expect(await finalizeRunFromLog(fakeAdmin(store), "run1")).toBeNull();
    expect(store.updates).toEqual([]); // status left untouched, not overwritten to 'sent'
  });
});
