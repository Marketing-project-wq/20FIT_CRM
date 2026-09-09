import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

// createAdminClient() is called with no args inside the helpers; the mock hands back whatever the
// current test set. Assigned per-test (read lazily at call time).
let currentAdmin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => currentAdmin }));

import { activeSendingRun, runProgress } from "./campaign-run";

interface RunRow {
  id: string; segment_id: string | null; workflow_id: string | null; template_key: string;
  label: string | null; status: string; created_by: string | null; created_at: string;
}
interface LogRow { campaign_id: string; sent_at: string | null }

/** Minimal PostgREST-ish fake: filters rows for the queried table; head:true returns a count. */
function fakeAdmin(data: { runRows?: RunRow[]; logRows?: LogRow[] }) {
  const runRows = data.runRows ?? [];
  const logRows = data.logRows ?? [];
  function query(table: string) {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let head = false;
    const resolve = (single: boolean) => {
      const src = (table === "crm_campaign_run" ? runRows : logRows) as unknown as Record<string, unknown>[];
      const rows = src.filter((r) => filters.every((f) => f(r)));
      if (head) return { count: rows.length, error: null };
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {
      select: (_c: string, opts?: { head?: boolean }) => { if (opts?.head) head = true; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      not: (c: string, _op: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve(resolve(true)),
      single: () => Promise.resolve(resolve(true)),
      then: (res: (v: unknown) => unknown) => Promise.resolve(resolve(false)).then(res),
    };
    return q;
  }
  return { from: (t: string) => query(t) };
}

function run(over: Partial<RunRow>): RunRow {
  return { id: "r1", segment_id: "seg1", workflow_id: null, template_key: "tpl1", label: "Promo", status: "sending", created_by: null, created_at: "2026-09-09T06:00:00Z", ...over };
}

beforeEach(() => { currentAdmin = null; });

describe("activeSendingRun (Part C double-send guard)", () => {
  it("finds a 'sending' run for the pair — so a second Send is refused, not silently doubled", async () => {
    currentAdmin = fakeAdmin({ runRows: [run({ id: "live", status: "sending" })] });
    const found = await activeSendingRun("seg1", "tpl1");
    expect(found?.id).toBe("live");
  });

  it("ignores a finished 'sent' run (that pair is free to send a new issue)", async () => {
    currentAdmin = fakeAdmin({ runRows: [run({ id: "done", status: "sent" })] });
    expect(await activeSendingRun("seg1", "tpl1")).toBeNull();
  });

  it("does not match another segment/template's sending run", async () => {
    currentAdmin = fakeAdmin({ runRows: [run({ id: "other", status: "sending", segment_id: "segX" })] });
    expect(await activeSendingRun("seg1", "tpl1")).toBeNull();
  });
});

describe("runProgress (Part A — counts from the database)", () => {
  it("reports run status + sent (sent_at rows) + logged (all rows) for the run", async () => {
    currentAdmin = fakeAdmin({
      runRows: [run({ id: "r1", status: "sending", label: "ISS" })],
      logRows: [
        { campaign_id: "r1", sent_at: "2026-09-09T06:01:00Z" },
        { campaign_id: "r1", sent_at: "2026-09-09T06:02:00Z" },
        { campaign_id: "r1", sent_at: null }, // claimed but not yet sent → counts in logged, not sent
        { campaign_id: "other", sent_at: "2026-09-09T06:03:00Z" }, // a different run → excluded
      ],
    });
    const p = await runProgress("r1");
    expect(p).toEqual({ status: "sending", label: "ISS", sent: 2, logged: 3, createdAt: "2026-09-09T06:00:00Z" });
  });

  it("returns null when the run row is gone", async () => {
    currentAdmin = fakeAdmin({ runRows: [] });
    expect(await runProgress("missing")).toBeNull();
  });
});
