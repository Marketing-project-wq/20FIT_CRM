import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { isUuid } from "@/lib/crm/audience";
import { isIdentityKind, clampDetail, LIFTED_REASON_MAX } from "@/lib/crm/suppression-input";
import { liftSuppression } from "@/lib/crm/suppression-write";
import { logApiFailure } from "@/lib/crm/failure-log";
import { getServerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * WRITE path: LIFT a suppression. Zero DELETE (D-4) — lift = status='lifted' + reason +
 * audit, all atomic in crm_lift_suppression (K-3). Built this sprint alongside record,
 * because a suppression that can't be lifted in-app WILL be lifted by hand in the SQL
 * editor — far worse (no reason, no audit).
 *
 * Gate: consent.edit, fail-closed. lifted_reason is REQUIRED. The identity is resolved
 * from the suppression ROW id server-side (the client never needs to hold the PII key),
 * then handed to the RPC. This route writes no audit row of its own — the RPC does.
 */
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { t } = getServerDict();
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "consent.edit")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "consent.edit"),
        message: t.consent.apiRoleDeniedLift,
      },
      { status: 403 },
    );
  }

  let body: { id?: unknown; lifted_reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", message: t.consent.apiBadJson }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const liftedReason = clampDetail(
    typeof body.lifted_reason === "string" ? body.lifted_reason : null,
    LIFTED_REASON_MAX,
  );
  if (!liftedReason) {
    return NextResponse.json(
      { error: "missing_lifted_reason", message: t.consent.apiMissingLiftReason },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Resolve identity from the row (server-side, so the PII key never round-trips).
  let row: { identity_kind: string; identity_key: string; status: string } | null;
  try {
    const res = await admin
      .from("crm_suppression")
      .select("identity_kind, identity_key, status")
      .eq("id", id)
      .maybeSingle();
    if (res.error) throw res.error;
    row = res.data as typeof row;
  } catch (e) {
    logApiFailure("/suppression/lift", "lookup_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isIdentityKind(row.identity_kind)) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (row.status === "lifted") {
    return NextResponse.json(
      { ok: true, action: "noop", status: "lifted", message: t.consent.apiAlreadyLifted },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let result;
  try {
    result = await liftSuppression(admin, {
      identityKind: row.identity_kind,
      identityKey: row.identity_key,
      liftedReason,
      actorId: userId,
      actorEmail: userEmail,
    });
  } catch (e) {
    logApiFailure("/suppression/lift", "rpc_write_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json(
      { error: "write_failed", message: t.consent.warn.srvWriteFailedLift },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      action: result.action,
      status: result.status,
      message: t.consent.warn.srvLiftSuccess,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
