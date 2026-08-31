import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
// send-campaign pulls these via the "@/" alias, which the test runner does not resolve; the resolver
// under test never calls them (admin is passed in), so stub them out to keep imports resolvable.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email/mailtrap", () => ({ sendTransactionalEmail: async () => ({ providerMessageId: null }) }));
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEmailListRecipients } from "./send-campaign";

/**
 * A manual email-list segment must resolve every address to a REAL master_customer uuid — because
 * crm_message_log.customer_id and crm_suppression.customer_id are both `uuid`. Addresses not in the
 * pool are returned as `unresolved` (so the caller refuses the send, naming them) — never turned into
 * a synthetic "manual:<email>" id, which threw `invalid input syntax for type uuid` and produced the
 * 28 Aug "unexpected_error" failures with zero message rows.
 */

/** Fake admin whose master_customer holds `pool` (email_normalized → customer_id uuid). */
function fakeAdmin(pool: Record<string, string>): SupabaseClient {
  const builder = {
    select() {
      return this;
    },
    in(_col: string, emails: string[]) {
      const data = emails
        .filter((e) => e in pool)
        .map((e) => ({ customer_id: pool[e], email_normalized: e }));
      return Promise.resolve({ data, error: null });
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("resolveEmailListRecipients — pool-only recipients, unresolved named", () => {
  it("returns real customer_id uuids for pool addresses (never a synthetic 'manual:' id)", async () => {
    const admin = fakeAdmin({ "a@x.com": A, "b@x.com": B });
    const { recipients, unresolved } = await resolveEmailListRecipients(admin, ["a@x.com", "b@x.com"]);
    expect(unresolved).toEqual([]);
    expect(recipients.map((r) => r.customerId).sort()).toEqual([A, B]);
    for (const r of recipients) {
      expect(r.customerId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(r.customerId.startsWith("manual:")).toBe(false);
    }
  });

  it("reports every address NOT in the pool as unresolved (the reject-early list)", async () => {
    const admin = fakeAdmin({ "in@x.com": A });
    const { recipients, unresolved } = await resolveEmailListRecipients(admin, [
      "in@x.com",
      "tifany@20fit.id",
      "marketing@20fit.id",
    ]);
    expect(recipients.map((r) => r.customerId)).toEqual([A]);
    expect(unresolved).toEqual(["tifany@20fit.id", "marketing@20fit.id"]);
  });

  it("normalises + dedupes before matching (trim/case), so an odd-cased duplicate is one lookup", async () => {
    const admin = fakeAdmin({ "a@x.com": A });
    const { recipients, unresolved } = await resolveEmailListRecipients(admin, ["  A@X.com ", "a@x.com", "not-an-email"]);
    expect(recipients).toHaveLength(1);
    expect(recipients[0].customerId).toBe(A);
    expect(unresolved).toEqual([]); // "not-an-email" has no @ → dropped by normalizeEmail, not "unresolved"
  });
});
