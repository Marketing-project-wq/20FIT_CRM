import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
// send-campaign pulls these via the "@/" alias the runner does not resolve; countSentToday is passed
// its admin, so stub them only to keep the import graph resolvable.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: async () => ({ providerMessageId: null }) }));
import { countSentToday } from "./send-campaign";

/**
 * T-43/T-44 LOCK — the daily ceiling counts provider-accepted rows by `sent_at`, so a webhook flipping
 * `sent → delivered` no longer erases the send from the count. The owner's scenario: one run of 100
 * successes, then every delivery webhook arrives → a SECOND run the same day must see 100 already used,
 * not 0. Under the OLD `status='sent'` filter this input returned 0 (all rows are 'delivered' now); the
 * assertions below are exactly what that regression could not satisfy.
 */

interface LogRow { status: string; sent_at: string | null }
function fakeLog(rows: LogRow[]) {
  return {
    from() {
      const filters: ((r: LogRow) => boolean)[] = [];
      const q = {
        select: () => q,
        eq: (col: keyof LogRow, val: string) => { filters.push((r) => r[col] === val); return q; },
        gte: (col: keyof LogRow, val: string) => { filters.push((r) => r[col] != null && (r[col] as string) >= val); return q; },
        then: (resolve: (v: { count: number; error: null }) => unknown) =>
          Promise.resolve({ count: rows.filter((r) => filters.every((f) => f(r))).length, error: null }).then(resolve),
      };
      return q;
    },
  } as never;
}

const NOW = "2026-09-09T10:00:00.000Z";

describe("countSentToday (T-43/T-44)", () => {
  it("a run of 100 whose webhooks all flipped sent→delivered is still counted as 100 (not 0)", async () => {
    const rows: LogRow[] = Array.from({ length: 100 }, () => ({ status: "delivered", sent_at: "2026-09-09T09:00:00.000Z" }));
    const alreadyToday = await countSentToday(fakeLog(rows), NOW);
    expect(alreadyToday).toBe(100);
    // A second same-day run seeds budget = dailyLimit - alreadyToday → 100 is spent, not re-granted.
    const dailyLimit = 1000;
    expect(Math.max(0, dailyLimit - alreadyToday)).toBe(900);
  });

  it("excludes FAILED rows (no sent_at) — they consumed no quota (T-43)", async () => {
    const rows: LogRow[] = [
      { status: "sent", sent_at: "2026-09-09T09:00:00.000Z" },
      ...Array.from({ length: 50 }, () => ({ status: "failed", sent_at: null })),
    ];
    expect(await countSentToday(fakeLog(rows), NOW)).toBe(1);
  });

  it("excludes rows sent on an earlier day (window is today)", async () => {
    const rows: LogRow[] = [
      { status: "delivered", sent_at: "2026-09-08T23:59:00.000Z" }, // yesterday
      { status: "delivered", sent_at: "2026-09-09T00:01:00.000Z" }, // today
    ];
    expect(await countSentToday(fakeLog(rows), NOW)).toBe(1);
  });

  it("counts a mix of sent + delivered + bounced-after-send together (all carry sent_at)", async () => {
    const rows: LogRow[] = [
      { status: "sent", sent_at: "2026-09-09T08:00:00.000Z" },
      { status: "delivered", sent_at: "2026-09-09T08:01:00.000Z" },
      { status: "bounced", sent_at: "2026-09-09T08:02:00.000Z" }, // bounced AFTER a successful send
      { status: "failed", sent_at: null }, // never sent → excluded
    ];
    expect(await countSentToday(fakeLog(rows), NOW)).toBe(3);
  });
});
