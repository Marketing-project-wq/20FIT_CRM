import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/crm/audience";
import { maskPhone, maskEmail } from "@/lib/crm/mask";
import { prepareIdentity, type IdentityKind } from "@/lib/crm/suppression-input";
import { recordSuppression } from "@/lib/crm/suppression-write";
import { verifyUnsubscribeToken, unsubscribeSecret } from "@/lib/crm/unsubscribe-token";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * PUBLIC self-service unsubscribe (contacting-half, TUGAS 3). No session: the SIGNED token IS the
 * authorization (verifyUnsubscribeToken). A tampered/forged token → 400, so nobody can unsubscribe
 * someone else by editing a UUID. The person's phone/email is NEVER in the URL — the token holds
 * only customer_id + kind, and the identity is resolved here from master_customer.
 *
 * The write goes through the SAME atomic RPC the staff /consent screen uses (recordSuppression →
 * crm_record_suppression: suppression row + audit row in ONE transaction, K-14). There is NO second
 * write path (LARANGAN). reason_code = 'user_request' (the person asked); source = 'unsubscribe_link'
 * distinguishes a self-service unsubscribe from a staff-recorded one; actor = 'system:unsubscribe-link'.
 *
 * GET  ?token=… → { valid, kind, identity(masked) } so the confirm page can show what will happen
 *                  WITHOUT revealing the raw contact or writing anything.
 * POST { token } → performs the unsubscribe (idempotent: re-clicking is a noop, never an error).
 */

async function resolve(token: unknown): Promise<
  | { ok: true; customerId: string; kind: IdentityKind; identityKey: string }
  | { ok: false; status: number; error: string }
> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, status: 400, error: "missing_token" };
  }
  let secret: string;
  try {
    secret = unsubscribeSecret();
  } catch {
    // Misconfiguration must fail closed and be traceable — never pretend it worked.
    logApiFailure("/unsubscribe", "secret_missing", {});
    return { ok: false, status: 503, error: "unavailable" };
  }
  const payload = verifyUnsubscribeToken(token, secret);
  if (!payload || !isUuid(payload.customerId)) {
    return { ok: false, status: 400, error: "invalid_token" };
  }

  const admin = createAdminClient();
  const column = payload.kind === "phone" ? "phone_normalized" : "email_normalized";
  let row: Record<string, string | null> | null;
  try {
    const res = await admin
      .from("master_customer")
      .select(`customer_id, ${column}`)
      .eq("customer_id", payload.customerId)
      .maybeSingle();
    if (res.error) throw res.error;
    row = res.data as Record<string, string | null> | null;
  } catch (e) {
    logApiFailure("/unsubscribe", "profile_lookup_failed", { code: (e as { code?: string })?.code });
    return { ok: false, status: 500, error: "query_failed" };
  }
  const rawIdentity = row?.[column] ?? null;
  if (!row || !rawIdentity) {
    // Valid token but the identity is gone — nothing to suppress. Treat as a benign "done".
    return { ok: false, status: 404, error: "no_identity" };
  }
  const prepared = prepareIdentity(payload.kind, rawIdentity);
  if (!prepared.ok) {
    return { ok: false, status: 422, error: "not_normalizable" };
  }
  return { ok: true, customerId: payload.customerId, kind: payload.kind, identityKey: prepared.identityKey };
}

function maskedOf(kind: IdentityKind, key: string): string {
  return (kind === "email" ? maskEmail(key) : maskPhone(key)) ?? "";
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const r = await resolve(token);
  if (!r.ok) {
    return NextResponse.json({ valid: false, error: r.error }, { status: r.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { valid: true, kind: r.kind, identity: maskedOf(r.kind, r.identityKey) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const r = await resolve(body.token);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status, headers: { "Cache-Control": "no-store" } });
  }

  let result;
  try {
    result = await recordSuppression(createAdminClient(), {
      identityKind: r.kind,
      identityKey: r.identityKey,
      reasonCode: "user_request",
      reasonDetail: null,
      customerId: r.customerId,
      source: "unsubscribe_link",
      actorId: null,
      actorEmail: "system:unsubscribe-link",
    });
  } catch (e) {
    logApiFailure("/unsubscribe", "rpc_write_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  // action is "added" (first time), "noop" (already unsubscribed), or "lifted" (never here).
  return NextResponse.json(
    { ok: true, action: result.action, kind: r.kind, identity: maskedOf(r.kind, r.identityKey) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
