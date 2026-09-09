import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * T-74 FULL-CHAIN LOCK — the one test the class needs.
 *
 * The sender-name bug was invisible to per-layer tests: the editor sent `sender_name`, the route
 * passed its own checks, the DB stored what it was given, the mailer sent what it was handed — each
 * layer green ALONE, while the value fell through the seam between the editor and the route. So this
 * test introduces the value ONCE at the top (the exact payload the editor POSTs) and asserts it ONCE
 * at the bottom (the `from.name` on the Mailtrap wire), running every hop through the REAL production
 * code — the route handler, the real `loadTemplates` select+map, the real `sendTransactionalEmail`.
 * Only `fetch` (the wire) and the Supabase client (one shared in-memory table) are faked. If ANY layer
 * drops or mangles the value, this goes red.
 */

vi.mock("server-only", () => ({}));

// One shared in-memory crm_message_template, written by the route and read back by loadTemplates.
const store: { rows: Record<string, unknown>[] } = { rows: [] };

/** Project a row to only the SELECTed columns — like PostgREST. This is what makes the test catch a
 *  select-list drop: if the send path stops selecting `sender_name`, the projected row no longer
 *  carries it, exactly as the real gateway would omit it. */
function project(row: Record<string, unknown>, cols: string | null): Record<string, unknown> {
  if (!cols || cols.trim() === "*") return { ...row };
  const keep = cols.split(",").map((c) => c.trim());
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in row) out[k] = row[k];
  return out;
}

function runQuery(state: QueryState): { data: unknown; error: unknown } {
  if (state.insertRow) {
    const row = { ...state.insertRow };
    store.rows.push(row);
    const projected = project(row, state.selectCols);
    return { data: state.single ? projected : [projected], error: null };
  }
  let rows = store.rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
  if (state.order) {
    const { col, asc } = state.order;
    rows = [...rows].sort((a, b) => (asc ? 1 : -1) * (Number(a[col]) - Number(b[col])));
  }
  if (state.limitN != null) rows = rows.slice(0, state.limitN);
  const projected = rows.map((r) => project(r, state.selectCols));
  if (state.single) return { data: projected[0] ?? null, error: null };
  return { data: projected, error: null };
}

interface QueryState {
  selectCols: string | null;
  filters: [string, unknown][];
  order: { col: string; asc: boolean } | null;
  limitN: number | null;
  insertRow: Record<string, unknown> | null;
  single: boolean;
}

function fakeAdmin() {
  function builder() {
    const state: QueryState = { selectCols: null, filters: [], order: null, limitN: null, insertRow: null, single: false };
    const api = {
      select: (cols?: string) => { if (cols) state.selectCols = cols; return api; },
      insert: (row: Record<string, unknown>) => { state.insertRow = row; return api; },
      eq: (col: string, val: unknown) => { state.filters.push([col, val]); return api; },
      order: (col: string, opts?: { ascending?: boolean }) => { state.order = { col, asc: opts?.ascending ?? true }; return api; },
      limit: (n: number) => { state.limitN = n; return api; },
      single: () => { state.single = true; return api; },
      maybeSingle: () => { state.single = true; return api; },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(runQuery(state)).then(resolve, reject),
    };
    return api;
  }
  return { from: () => builder() };
}

// The "@/" alias is not resolved by the test runner (repo convention), so every "@/" specifier the
// route + send path pull in must be stubbed. The two below are FAKED (I/O boundaries); the three
// redirected to their REAL relative module so the gate, the validator and the mailer run for real —
// this test must exercise the actual code, not stand-ins, or it would not lock the chain.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock("@/lib/auth/current-role", () => ({ getCurrentUserRole: async () => "super_admin" }));
vi.mock("@/lib/auth/roles", async () => await import("../auth/roles"));
vi.mock("@/lib/email/sender-name", async () => await import("../email/sender-name"));
vi.mock("@/lib/email/mailtrap", async () => await import("../email/mailtrap"));

import { POST } from "../../app/api/templates/route";
import { loadTemplates } from "./send-campaign";
import { sendTransactionalEmail } from "../email/mailtrap";
import type { NextRequest } from "next/server";

describe("sender name survives editor → route → DB → send → Mailtrap from.name", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    store.rows = [];
    process.env.MAILTRAP_API_TOKEN = "test-token";
    process.env.MAILTRAP_FROM = "crm@20fit.id";
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, message_ids: ["id-1"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAILTRAP_API_TOKEN;
    delete process.env.MAILTRAP_FROM;
  });

  it("one value in at the editor, the same value out at the wire (T-74)", async () => {
    const TEMPLATE_KEY = "email_chain_test";
    // 1. The EXACT shape email-template-builder.tsx POSTs — including a messy sender_name that the
    //    route must clean (newline + repeated spaces). If the layers are honest, this exact word makes
    //    it all the way to from.name.
    const editorPayload = {
      template_key: TEMPLATE_KEY,
      channel: "email",
      language: "id",
      name: "Promo",
      subject: "Promo",
      body: "<p>Halo {{first_name}}</p>",
      sender_name: "  20FIT   Studio\nKemang ",
    };
    const req = { json: async () => editorPayload } as unknown as NextRequest;

    // 2. Route persists it (real handler over the fake table).
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].sender_name).toBe("20FIT Studio Kemang"); // cleaned at the write path

    // 3. The send path reads it back through the REAL loadTemplates (same select + map send uses).
    const templates = await loadTemplates(fakeAdmin() as never, TEMPLATE_KEY);
    expect(templates.id?.senderName).toBe("20FIT Studio Kemang"); // not dropped by the select list

    // 4. The wire: real sendTransactionalEmail, exactly as send() calls it (tpl.senderName).
    await sendTransactionalEmail(
      { to: "x@example.com", subject: "s", text: "t", html: "<p>t</p>" },
      "crm-campaign",
      templates.id?.senderName ?? undefined,
    );
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sentBody.from).toEqual({ email: "crm@20fit.id", name: "20FIT Studio Kemang" });
  });
});
