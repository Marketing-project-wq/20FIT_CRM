import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, shouldMaskContact, resolveGrant } from "@/lib/auth/roles";
import { isUuid } from "@/lib/crm/audience";
import { maskPhone, maskEmail } from "@/lib/crm/mask";
import {
  isIdentityKind,
  isOfferedReason,
  prepareIdentity,
  clampDetail,
  REASON_DETAIL_MAX,
  type IdentityKind,
} from "@/lib/crm/suppression-input";
import { recordSuppression } from "@/lib/crm/suppression-write";

export const dynamic = "force-dynamic";

/**
 * WRITE path: record a stop-contact request. FIRST endpoint in the system that writes
 * data. It records a request that ALREADY HAPPENED (someone asked to stop) — it does not
 * offer an action.
 *
 * Gate: consent.edit (super_admin, crm_manager, data_steward), fail-closed.
 *
 * It does NOT write an audit row itself — crm_record_suppression writes the suppression
 * row AND its audit row in one transaction (K-3). Two writes here would double-count.
 *
 * Two identity sources, exactly one per call:
 *   - customer_id present  → the server reads master_customer's phone_normalized /
 *     email_normalized for the chosen kind (raw identity never round-trips the client).
 *   - customer_id absent   → identity_value (raw, typed by an operator on /consent).
 * Either way the value is put through normalize.ts; a null normalization is rejected
 * (422) and nothing is written.
 *
 * dry_run: true normalizes + reports what WOULD be written (and whether a row already
 * exists) WITHOUT writing. It reveals nothing a consent.edit role can't already see on
 * /consent, so it is not separately audited; the real write's audit is the record.
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

  const role = await getCurrentUserRole();
  if (!isPermitted(role, "consent.edit")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "consent.edit"),
        message: "Hanya super_admin, crm_manager, dan data_steward yang boleh mencatat suppression.",
      },
      { status: 403 },
    );
  }

  let body: {
    customer_id?: unknown;
    identity_kind?: unknown;
    identity_value?: unknown;
    reason_code?: unknown;
    reason_detail?: unknown;
    dry_run?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body JSON tidak valid." }, { status: 400 });
  }

  const identityKind = body.identity_kind;
  if (!isIdentityKind(identityKind)) {
    return NextResponse.json(
      { error: "invalid_identity_kind", message: "Pilih identitas yang disuppress: telepon atau email." },
      { status: 422 },
    );
  }
  const reasonCode = body.reason_code;
  if (!isOfferedReason(reasonCode)) {
    return NextResponse.json(
      { error: "invalid_reason_code", message: "Alasan tidak valid untuk pencatatan manual." },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Resolve the RAW identity value from exactly one source.
  const customerIdRaw = typeof body.customer_id === "string" ? body.customer_id : null;
  let rawIdentity: string | null = null;
  let customerId: string | null = null;

  if (customerIdRaw) {
    if (!isUuid(customerIdRaw)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    customerId = customerIdRaw;
    const column = identityKind === "phone" ? "phone_normalized" : "email_normalized";
    let row;
    try {
      const res = await admin
        .from("master_customer")
        .select(`customer_id, ${column}`)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (res.error) throw res.error;
      row = res.data as Record<string, string | null> | null;
    } catch {
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    rawIdentity = (row[column] as string | null) ?? null;
    if (!rawIdentity) {
      return NextResponse.json(
        {
          error: "no_identity_on_profile",
          message:
            identityKind === "phone"
              ? "Profil ini tidak punya nomor telepon untuk disuppress."
              : "Profil ini tidak punya email untuk disuppress.",
        },
        { status: 422 },
      );
    }
  } else {
    rawIdentity = typeof body.identity_value === "string" ? body.identity_value : null;
    if (!rawIdentity || rawIdentity.trim() === "") {
      return NextResponse.json(
        { error: "missing_identity", message: "Isi nomor telepon atau email yang minta berhenti." },
        { status: 422 },
      );
    }
  }

  // ALWAYS normalize (D-2). Null → reject, never store raw.
  const prepared = prepareIdentity(identityKind as IdentityKind, rawIdentity);
  if (!prepared.ok) {
    return NextResponse.json({ error: "not_normalizable", message: prepared.error }, { status: 422 });
  }

  const masked = shouldMaskContact(role);
  const maskedPreview =
    prepared.identityKind === "email" ? maskEmail(prepared.identityKey) : maskPhone(prepared.identityKey);
  // What the caller is authorized to SEE of the key (clear for view_contact roles).
  const shownKey = masked ? maskedPreview : prepared.identityKey;

  const reasonDetail = clampDetail(
    typeof body.reason_detail === "string" ? body.reason_detail : null,
    REASON_DETAIL_MAX,
  );

  // ── DRY RUN: show what WILL be written; report existing status; write nothing. ──
  if (body.dry_run === true) {
    let existingStatus: string | null = null;
    try {
      const res = await admin
        .from("crm_suppression")
        .select("status")
        .eq("identity_kind", prepared.identityKind)
        .eq("identity_key", prepared.identityKey)
        .maybeSingle();
      if (res.error) throw res.error;
      existingStatus = (res.data as { status: string } | null)?.status ?? null;
    } catch {
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }
    const willDo =
      existingStatus === "active" ? "noop" : existingStatus === "lifted" ? "reactivate" : "insert";
    return NextResponse.json(
      {
        dry_run: true,
        identity_kind: prepared.identityKind,
        identity_key: shownKey,
        masked,
        existing_status: existingStatus,
        will_do: willDo,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── REAL WRITE: atomic RPC (suppression row + audit row in one transaction). ──
  let result;
  try {
    result = await recordSuppression(admin, {
      identityKind: prepared.identityKind,
      identityKey: prepared.identityKey,
      reasonCode: reasonCode as string,
      reasonDetail,
      customerId,
      source: "crm_app",
      actorId: userId,
      actorEmail: userEmail,
    });
  } catch {
    // The RPC is atomic — a failure leaves NO half-row (suppression without audit).
    return NextResponse.json(
      { error: "write_failed", message: "Gagal mencatat suppression. Tidak ada baris separuh jadi." },
      { status: 500 },
    );
  }

  const consequence =
    result.action === "noop"
      ? "Sudah ada suppression aktif untuk identitas ini — tidak ada perubahan."
      : result.reactivated
        ? "Suppression diaktifkan kembali. Orang ini kini TIDAK bisa dihubungi, apa pun status consent-nya."
        : "Permintaan berhenti dicatat. Orang ini kini TIDAK bisa dihubungi, apa pun status consent-nya.";

  return NextResponse.json(
    {
      ok: true,
      action: result.action,
      status: result.status,
      reactivated: result.reactivated ?? false,
      identity_kind: prepared.identityKind,
      identity_key: shownKey,
      masked,
      message: consequence,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
