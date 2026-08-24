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

  // A permissive chainable builder: every filter/select returns itself; awaiting yields empty.
  function builder() {
    const api: Record<string, unknown> = {};
    const ret = () => api;
    for (const m of ["select", "eq", "not", "is", "gt", "lt", "ilike", "in", "order", "range", "limit"]) {
      api[m] = ret;
    }
    api.maybeSingle = () => ({ then: (r: (v: unknown) => void) => r({ data: null, error: null }) });
    api.then = (r: (v: unknown) => void) => r({ data: [], count: 0, error: null });
    return api;
  }

  const admin = {
    from: (t: string) => {
      tables.add(t);
      return builder();
    },
    rpc: (name: string) => {
      rpcs.add(name);
      return { then: (r: (v: unknown) => void) => r({ data: { marketing: 0, transactional: 0 }, error: null }) };
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

  it("CONTACTABLE block calls exactly the live RPC (never precomputed)", async () => {
    const { admin, rpcs } = recordingFake();
    await fetchContactableBlock(admin);
    expect(rpcs.has("crm_contactable_counts")).toBe(true);
  });

  it("EVENTS block does the event tally on customer_engagement (and the RPC does not)", async () => {
    const { admin, tables, rpcs } = recordingFake();
    await fetchEventsBlock(admin);
    expect(tables.has("customer_engagement")).toBe(true);
    expect(rpcs.size).toBe(0);
  });

  it("MIRROR block reads the snapshot (mirror + meta), not the contactable RPC", async () => {
    const { admin, tables, rpcs } = recordingFake();
    await fetchMirrorBlock(admin);
    expect(tables.has("crm_customer_mirror")).toBe(true);
    expect(tables.has("crm_mirror_meta")).toBe(true);
    expect(rpcs.size).toBe(0);
  });

  it("SOURCES block reads live source tables, not the contactable RPC", async () => {
    const { admin, rpcs } = recordingFake();
    await fetchSourcesBlock(admin);
    expect(rpcs.size).toBe(0);
  });
});
