import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, resolveGrant } from "@/lib/auth/roles";
import { fetchQualitySnapshot } from "@/lib/crm/quality";

export const dynamic = "force-dynamic";

/**
 * Data-quality snapshot API. Aggregates only — this endpoint can never return an
 * individual profile.
 *
 * Enforcement, all server-side:
 *   1. Signed in -> else 401.
 *   2. Role resolved server-side via the service role; the client is never trusted.
 *   3. FAIL-CLOSED on profile.view_list. Gating quality on the SAME action the
 *      audience list uses is deliberate — canSeeNav("/quality") already resolves to
 *      canViewProfileList, and a menu item that is visible but 403s is a bug.
 *   4. NO masking step, and that is not an omission: fetchQualitySnapshot runs every
 *      query with head:true, so no phone, email or name is ever read. Nothing to mask.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * NO AUDIT ROW IS WRITTEN HERE — and that is the RULE, not an oversight.
 *
 *   Audit is mandatory when a response contains INDIVIDUAL ROWS, or when the
 *   aggregate is SHAPED BY USER-SUPPLIED PARAMETERS. A fixed, parameter-free
 *   aggregate is NOT audited.
 *
 * Audit answers "who looked at whose data". A fixed count has no "whose" on its
 * object — the row would answer nothing, and would only add volume that migration 8
 * must later purge. This endpoint takes ZERO parameters from the client and returns
 * only counts, so it earns no audit row. (Contrast /api/audience: individual rows +
 * user filters -> mandatory audit; and the audit-log screen at /api/audit, same.)
 *
 * ⚠️  WARNING TO THE NEXT PERSON — READ BEFORE ADDING A FILTER HERE:
 * The moment this endpoint accepts ANY parameter from the client (a unit filter, a
 * city, a date range — anything that lets the caller narrow the aggregate), the count
 * can be squeezed until it points at one person, and it STOPS being a plain aggregate.
 * At that instant audit becomes MANDATORY again: write a `list.viewed` row
 * (target_table = 'master_customer', NEVER a new action name — migration 8 purges on
 * an exact allowlist) and refuse to serve (503) if that write fails, exactly as
 * /api/audience does. Do not add a filter and leave this comment behind.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * There is no POST/PUT/DELETE and no export path: read-only by construction.
 */
export async function GET() {
  // 1. Session
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

  // 2 + 3. Role, fail-closed
  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    const decision = resolveGrant(role, "profile.view_list");
    return NextResponse.json(
      {
        error: "forbidden",
        decision,
        message:
          decision === "needs_scope"
            ? "unit_manager tanpa cakupan unit yang terdefinisi — akses ditolak (fail-closed sampai tabel unit-scope ada)."
            : "Peran Anda tidak memiliki izin melihat kualitas data profil.",
      },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  try {
    const snapshot = await fetchQualitySnapshot(admin);
    // No audit write: fixed parameter-free aggregate (see the rule above).
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never leak DB internals to the client.
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
