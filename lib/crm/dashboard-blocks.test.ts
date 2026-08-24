import { describe, it, expect, vi } from "vitest";

// dashboard.ts + its deps are `import "server-only"`.
vi.mock("server-only", () => ({}));

import {
  fetchImmediateBlock,
  fetchContactableBlock,
  fetchMirrorBlock,
  fetchEventsBlock,
  fetchSourcesBlock,
} from "./dashboard";

/**
 * Progressive-load sprint — guard the SPLIT's whole purpose: the IMMEDIATE block must be cheap.
 * It must NOT invoke the ~2.9s contactable RPC, nor the ~20-page event tally on customer_engagement,
 * nor the mirror — otherwise "load the cheap parts first" is a lie and the page waits on the slow
 * work again. This records which tables/RPCs each block touches and asserts the cost boundary.
 */

function recordingFake() {
  const tables = new Set<string>();
  const rpcs = new Set<string>();

  // The precompute blob crm_mirror_meta serves (fail-hard reader throws if any block is absent).
  const META_ROW = {
    dashboard_stats: {
      engagement: { membership: 1, event: 1, arena: 1, clinic: 1, gym: 1 },
      rfm: { buckets: [{ label: "New User", count: 1 }], tanpa: 0 },
      fitco: { matched: 1, unmatched: 0, staging_rows: 1, staging_unique: 1 },
      ecosystem: { gym: 1 },
      candidates: { total: 1, by_source: {} },
      sources: {},
    },
    refreshed_at: "2026-08-24T00:00:00Z",
    row_count: 1,
  };

  // A permissive chainable builder: every filter/select returns itself; awaiting yields empty.
  // crm_mirror_meta.maybeSingle serves the precompute row so the fail-hard reader doesn't throw.
  function builder(table: string) {
    const api: Record<string, unknown> = {};
    const ret = () => api;
    for (const m of ["select", "eq", "not", "is", "gt", "lt", "ilike", "in", "order", "range", "limit"]) {
      api[m] = ret;
    }
    const single = table === "crm_mirror_meta" ? META_ROW : null;
    api.maybeSingle = () => ({ then: (r: (v: unknown) => void) => r({ data: single, error: null }) });
    api.then = (r: (v: unknown) => void) => r({ data: [], count: 0, error: null });
    return api;
  }

  const admin = {
    from: (t: string) => {
      tables.add(t);
      return builder(t);
    },
    rpc: (name: string) => {
      rpcs.add(name);
      // Distinct, recognisable values so a test can prove the block passes the RPC output THROUGH
      // verbatim (no second calculation that would return something else).
      return { then: (r: (v: unknown) => void) => r({ data: { marketing: 42, transactional: 43 }, error: null }) };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { admin, tables, rpcs };
}

describe("dashboard block cost boundaries (progressive-load)", () => {
  it("IMMEDIATE block is cheap: no contactable RPC, no event tally, no mirror", async () => {
    const { admin, tables, rpcs } = recordingFake();
    await fetchImmediateBlock(admin);
    // Only the fast head-count tables.
    expect(tables.has("master_customer")).toBe(true);
    expect(tables.has("staging_20fit_data")).toBe(true);
    // The expensive work lives in OTHER blocks — never here.
    expect(rpcs.size).toBe(0); // the ~2.9s RPC is not called
    expect(tables.has("customer_engagement")).toBe(false); // the ~20-page event tally is not here
    expect(tables.has("crm_customer_mirror")).toBe(false);
    expect(tables.has("crm_mirror_meta")).toBe(false);
  });

  it("CONTACTABLE block comes ONLY from crm_contactable_counts — passed through, never recomputed", async () => {
    const { admin, tables, rpcs } = recordingFake();
    const out = await fetchContactableBlock(admin);
    // The dashboard's contactable numbers have ONE source: the RPC. This guards against a second
    // calculation path (the "one rule, two implementations" pattern that bit phone canon, the
    // retention list, and the export's phone vs phone_normalized). The segment BUILDER computes its
    // own contactable via the consent embed (segment-read.ts) — that is a different screen, with
    // criteria, and must never leak into the dashboard block.
    expect(rpcs.has("crm_contactable_counts")).toBe(true);
    expect(rpcs.size).toBe(1); // exactly the RPC — no other RPC
    expect(tables.size).toBe(0); // NO table read → nothing is recomputed from consent/suppression here
    // The RPC's output is returned verbatim (marketing→marketing, transactional→service).
    expect(out).toEqual({ contactableMarketing: 42, contactableService: 43 });
  });

  it("EVENTS block does the event tally on customer_engagement (and the RPC does not)", async () => {
    const { admin, tables, rpcs } = recordingFake();
    await fetchEventsBlock(admin);
    expect(tables.has("customer_engagement")).toBe(true);
    expect(rpcs.size).toBe(0);
  });

  it("MIRROR block reads the PRECOMPUTE blob (crm_mirror_meta) + live shop, not the contactable RPC", async () => {
    const { admin, tables, rpcs } = recordingFake();
    await fetchMirrorBlock(admin);
    // Unit spread + RFM now come from one dashboard_stats blob read, not the 5 matview scans.
    expect(tables.has("crm_mirror_meta")).toBe(true);
    // shop has no precompute column, so it stays a live count on customer_engagement.
    expect(tables.has("customer_engagement")).toBe(true);
    expect(rpcs.size).toBe(0);
  });

  it("SOURCES block reads live source tables, not the contactable RPC", async () => {
    const { admin, rpcs } = recordingFake();
    await fetchSourcesBlock(admin);
    expect(rpcs.size).toBe(0);
  });
});
