import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/admin";
import { activeSendingRunFor } from "./campaign-run";

/**
 * PROOF for the double-send guard (ported from PR #45, the 890-recipient ISS incident). A NEW run to a
 * (segment, template) that already has one IN PROGRESS would be a second campaign_id → different
 * idempotency keys → everyone emailed twice. activeSendingRunFor is what sendCampaignAction consults to
 * refuse that. These lock what it matches: only status 'sending', only the SAME (segment, template),
 * newest first.
 */
interface Run { id: string; label: string | null; segment_id: string; template_key: string; status: string; created_at: string }

function fakeAdmin(rows: Run[]) {
  return {
    from() {
      const filters: Record<string, unknown> = {};
      const b = {
        select: () => b,
        eq: (col: string, val: unknown) => { filters[col] = val; return b; },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          const match = rows
            .filter((r) => Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
            .sort((a, z) => (a.created_at < z.created_at ? 1 : -1))[0];
          return { data: match ?? null, error: null };
        },
      };
      return b;
    },
  };
}

const useRows = (rows: Run[]) => (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeAdmin(rows));

describe("activeSendingRunFor — the second-run double-send guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds a 'sending' run for the exact (segment, template)", async () => {
    useRows([{ id: "r1", label: "Newsletter", segment_id: "s1", template_key: "t1", status: "sending", created_at: "2026-09-09T06:00:00Z" }]);
    expect(await activeSendingRunFor("s1", "t1")).toEqual({ id: "r1", label: "Newsletter" });
  });

  it("IGNORES a finished ('sent') run — a new issue after one completed is allowed", async () => {
    useRows([{ id: "r1", label: "X", segment_id: "s1", template_key: "t1", status: "sent", created_at: "2026-09-09T06:00:00Z" }]);
    expect(await activeSendingRunFor("s1", "t1")).toBeNull();
  });

  it("IGNORES a 'sending' run for a DIFFERENT (segment, template)", async () => {
    useRows([{ id: "r1", label: "X", segment_id: "s2", template_key: "t1", status: "sending", created_at: "2026-09-09T06:00:00Z" }]);
    expect(await activeSendingRunFor("s1", "t1")).toBeNull();
  });

  it("returns the NEWEST in-progress run when more than one exists", async () => {
    useRows([
      { id: "old", label: "Old", segment_id: "s1", template_key: "t1", status: "sending", created_at: "2026-09-09T06:00:00Z" },
      { id: "new", label: "New", segment_id: "s1", template_key: "t1", status: "sending", created_at: "2026-09-09T07:00:00Z" },
    ]);
    expect((await activeSendingRunFor("s1", "t1"))?.id).toBe("new");
  });
});
