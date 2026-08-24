import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import {
  fetchImmediateBlock,
  fetchContactableBlock,
  fetchMirrorBlock,
  fetchEventsBlock,
  fetchSourcesBlock,
  type DashboardBlockName,
} from "@/lib/crm/dashboard";
import { logApiFailure } from "@/lib/crm/failure-log";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Dashboard KPI API — served ONE BLOCK per request (`?block=immediate|contactable|mirror|events|
 * sources`), so the client can render the cheap block in ~250ms and let the expensive ones (the
 * ~2.9s contactable RPC, the ~20-page event tally) arrive in their own place (Progressive-load
 * sprint). Aggregates only (counts + a max date) — never an individual profile.
 *
 * Gated on profile.view_list, the same action as the other read screens, so a role without list
 * access gets 403 and the UI shows `—` cards instead of numbers. NO AUDIT ROW, by the project
 * rule (see /api/quality + README): audit is mandatory only when a response contains individual
 * rows OR the aggregate is shaped by user-supplied parameters. `?block=` selects a fixed block —
 * it is NOT a data filter (a closed enum, not a query), so no "whose" to record. No masking
 * either (nothing individual is read). Server-side by construction.
 */
const BLOCKS: Record<DashboardBlockName, (admin: SupabaseClient) => Promise<unknown>> = {
  immediate: fetchImmediateBlock,
  contactable: fetchContactableBlock,
  mirror: fetchMirrorBlock,
  events: fetchEventsBlock,
  sources: fetchSourcesBlock,
};

function isBlockName(v: string | null): v is DashboardBlockName {
  return v != null && Object.prototype.hasOwnProperty.call(BLOCKS, v);
}

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    return NextResponse.json(
      { error: "forbidden", decision: resolveGrant(role, "profile.view_list") },
      { status: 403 },
    );
  }

  const block = request.nextUrl.searchParams.get("block");
  if (!isBlockName(block)) {
    return NextResponse.json({ error: "bad_request", message: "unknown block" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const data = await BLOCKS[block](admin);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Sprint 3K failure path — route + which block failed + the DB code. NO PII (this endpoint
    // never touches an identity), so the block name is safe context, not subject data.
    logApiFailure("/dashboard", `block_failed:${block}`, { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed", block }, { status: 500 });
  }
}
