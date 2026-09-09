import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: async () => ({ providerMessageId: null }) }));
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueRunDrain } from "./send-drain";

/**
 * The APP side of the double-send hard stop: when the DB's partial unique index refuses a second
 * 'sending' run for a (segment, template), the UPDATE returns error code 23505, and enqueueRunDrain
 * must translate that into `conflict: true` — NOT a generic failure — so the action reports
 * send_in_progress and abandons the orphan (the DB-level rejection is proven separately, by the AST of
 * the index in campaign-run-unique-active.test.ts and, at deploy, by a real rejected INSERT).
 */
function fakeAdmin(updateError: { code?: string } | null): SupabaseClient {
  const b: Record<string, unknown> = {};
  b.update = () => b;
  b.eq = () => b;
  b.then = (onF: (v: { error: unknown }) => unknown) => Promise.resolve({ error: updateError }).then(onF);
  return { from: () => b } as unknown as SupabaseClient;
}

describe("enqueueRunDrain — the DB unique-violation becomes a conflict signal", () => {
  it("a clean write → ok, not a conflict", async () => {
    expect(await enqueueRunDrain(fakeAdmin(null), "r1", "op@20fit.id")).toEqual({ ok: true, conflict: false });
  });

  it("23505 (the partial unique index) → ok:false, conflict:true (another send already running)", async () => {
    expect(await enqueueRunDrain(fakeAdmin({ code: "23505" }), "r1", "op@20fit.id")).toEqual({ ok: false, conflict: true });
  });

  it("any OTHER error → ok:false, conflict:false (a real failure, reported as enqueue_failed)", async () => {
    expect(await enqueueRunDrain(fakeAdmin({ code: "42P01" }), "r1", "op@20fit.id")).toEqual({ ok: false, conflict: false });
  });
});
