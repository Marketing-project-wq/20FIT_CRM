import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rfmFromPrecompute, unitSpreadFromEngagement, MIRROR_ENGAGEMENT_UNITS, fetchMirrorBlock } from "./dashboard";
import { fetchMirrorDashboardStats, DASHBOARD_STATS_BLOCKS } from "./mirror";

/**
 * Commit 1 (C) — the precompute read + its two K-08 guarantees.
 *
 * The bug this locks out: the precompute's RFM `buckets` are a GROUP BY, so "Campion user" (1
 * person in staging, 0 matched into the mirror) has NO row. If the display list were built from the
 * blob's buckets, that category would VANISH — read as "this category doesn't exist" instead of the
 * measured 0 it is. And a wrong (non-service-role) client reads the RLS-protected meta table as
 * NULL; returning zeros there would make a wrong-client 0 indistinguishable from a measured 0.
 */

// A blob shaped like the real dashboard_stats (verified 2026-08-24). NOTE: rfm.buckets has NO
// "Campion user" row — exactly the production shape.
const REAL_RFM = {
  buckets: [
    { label: "New User", count: 74021 },
    { label: "Potensial user", count: 6837 },
    { label: "Loyal user", count: 63 },
  ],
  tanpa: 1332,
};

describe("rfmFromPrecompute — closed vocabulary, zero bucket never vanishes (K-08)", () => {
  const out = rfmFromPrecompute(REAL_RFM);

  it("lists EVERY closed-vocabulary bucket, incl. the one absent from the blob, as a measured 0", () => {
    const campion = out.find((r) => r.value === "Campion user");
    expect(campion).toBeDefined(); // not dropped
    expect(campion!.count).toBe(0); // 0, not missing
  });

  it("keeps the stored misspelling verbatim (never 'Champion')", () => {
    expect(out.some((r) => r.value === "Campion user")).toBe(true);
    expect(out.some((r) => r.value === "Champion user")).toBe(false);
  });

  it("carries the real bucket counts + the '-' no-bucket total, sorted desc", () => {
    expect(out.find((r) => r.value === "New User")!.count).toBe(74021);
    expect(out.find((r) => r.value === "-")!.count).toBe(1332);
    const counts = out.map((r) => r.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("always has all four named buckets + '-' (5 rows), whatever the blob contains", () => {
    expect(rfmFromPrecompute({ buckets: [], tanpa: 0 })).toHaveLength(5);
    expect(new Set(rfmFromPrecompute({ buckets: [], tanpa: 0 }).map((r) => r.value)).size).toBe(5);
  });
});

describe("unitSpreadFromEngagement — every mirror unit present + live shop", () => {
  it("emits all five mirror units (even a key the blob omits → 0) plus a live shop row", () => {
    const rows = unitSpreadFromEngagement({ membership: 67828, event: 18247, arena: 2075, clinic: 1014 }, 18);
    for (const u of MIRROR_ENGAGEMENT_UNITS) {
      const row = rows.find((r) => r.unit === u);
      expect(row, `unit ${u} must appear`).toBeDefined();
      expect(row!.source).toBe("mirror");
    }
    // gym was omitted from the blob → 0 measured, not dropped.
    expect(rows.find((r) => r.unit === "gym")!.profiles).toBe(0);
    const shop = rows.find((r) => r.unit === "shop")!;
    expect(shop.profiles).toBe(18);
    expect(shop.source).toBe("live");
    // sorted desc
    const p = rows.map((r) => r.profiles);
    expect(p).toEqual([...p].sort((a, b) => b - a));
  });
});

// ── fail-hard reader: never zeros on absence ────────────────────────────────────────────────

function fakeMeta(row: unknown) {
  const builder = {
    select() { return this; },
    maybeSingle() { return this; },
    then(resolve: (v: unknown) => void) { resolve({ data: row, error: null }); },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder } as any;
}

const FULL_BLOB = {
  engagement: { membership: 1 }, rfm: REAL_RFM, fitco: { matched: 1 },
  ecosystem: { gym: 1 }, candidates: { total: 1, by_source: {} }, sources: {},
};

describe("fetchMirrorDashboardStats — fails hard, never substitutes zeros", () => {
  it("THROWS when the blob is absent (wrong client / RLS-denied → data null)", async () => {
    await expect(fetchMirrorDashboardStats(fakeMeta(null))).rejects.toThrow(/absent/i);
    await expect(fetchMirrorDashboardStats(fakeMeta({ dashboard_stats: null }))).rejects.toThrow(/absent/i);
  });

  it("THROWS when ANY expected block is missing (half-populated precompute is a bug, not zeros)", async () => {
    for (const missing of DASHBOARD_STATS_BLOCKS) {
      const partial = { ...FULL_BLOB } as Record<string, unknown>;
      delete partial[missing];
      await expect(
        fetchMirrorDashboardStats(fakeMeta({ dashboard_stats: partial, refreshed_at: "x", row_count: 1 })),
        `missing ${missing} must throw`,
      ).rejects.toThrow(new RegExp(missing));
    }
  });

  it("returns the typed blob + meta when every block is present", async () => {
    const out = await fetchMirrorDashboardStats(fakeMeta({ dashboard_stats: FULL_BLOB, refreshed_at: "2026-08-24T00:00:00Z", row_count: 82253 }));
    expect(out.engagement.membership).toBe(1);
    expect(out.refreshedAt).toBe("2026-08-24T00:00:00Z");
    expect(out.rowCount).toBe(82253);
  });
});

// A fuller fake: crm_mirror_meta serves `metaRow`; every other table (customer_engagement, for the
// live shop count) is a chainable no-op resolving empty — so the ONLY thing that can throw is the
// absent blob, not the shop count.
function fakeAdmin(metaRow: unknown) {
  const build = (table: string) => {
    const api: Record<string, unknown> = {};
    const ret = () => api;
    for (const m of ["select", "eq", "not", "is", "gt", "lt", "ilike", "in", "order", "range", "limit"]) api[m] = ret;
    api.maybeSingle = () => ({ then: (r: (v: unknown) => void) => r({ data: table === "crm_mirror_meta" ? metaRow : null, error: null }) });
    api.then = (r: (v: unknown) => void) => r({ data: [], count: 0, error: null });
    return api;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => build(t) } as any;
}

describe("fetchMirrorBlock — the throw is CONTAINED at the block boundary (not a blank page)", () => {
  it("REJECTS when the precompute is absent, so the route's per-block catch turns it into the mirror section's failure state", async () => {
    // The route wraps fetchMirrorBlock in try/catch → 500 {block:'mirror'}; the client maps that to
    // mirrorB.status='error', which the unit-spread AND rfm sections render as <BlockFail> + retry.
    // `denied` (the only whole-page blank) is immediate-only, so a mirror throw cannot blank the page.
    await expect(fetchMirrorBlock(fakeAdmin({ dashboard_stats: null }))).rejects.toThrow(/absent/i);
  });

  it("resolves the unit spread + RFM from a complete precompute", async () => {
    const block = await fetchMirrorBlock(fakeAdmin({ dashboard_stats: FULL_BLOB, refreshed_at: "x", row_count: 1 }));
    expect(block.unitSpread.some((u) => u.unit === "shop" && u.source === "live")).toBe(true);
    expect(block.importRfm.some((r) => r.value === "Campion user" && r.count === 0)).toBe(true);
  });
});
