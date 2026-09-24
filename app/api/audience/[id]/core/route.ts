import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { isUuid } from "@/lib/crm/audience";
import { isSegmentValue, isFirstUnitValue } from "@/lib/crm/core-vocab";
import { logApiFailure } from "@/lib/crm/failure-log";
import { normalizeEmail } from "@/lib/crm/normalize";

export const dynamic = "force-dynamic";

/**
 * WRITE path: correct the CORE master_customer fields — name / phone / city / first_unit / segment /
 * LTV (Bagian B, 8 Sep 2026). The FIRST app path that UPDATEs master_customer. Unlike the demographic
 * route (fill-empty-only, a separate table), this MAY overwrite existing values — owner decision.
 *
 * Every guarantee is in the RPC crm_update_master_fields (SECURITY DEFINER, service_role only):
 * atomic audit (K-14), actor REQUIRED (it refuses a null-actor call — so this route MUST pass one),
 * phone normalized inside via crm_norm_phone, unique-phone collision → {error:'phone_taken'} with NO
 * other customer's PII, merged rows → {error:'row_merged'}, closed segment/first_unit vocab, LTV≥0,
 * length caps. This route pre-validates the closed vocab (so the operator gets a clean 422 rather
 * than a raised SQL error) and maps the RPC's own outcomes.
 *
 * Gate: profile.edit_core — super_admin + crm_manager + data_steward (canEditCore). Enforced here.
 * email IS accepted (owner override of K-57) — validated, dedup-checked, and written via admin client
 * since the RPC doesn't accept it. Empty-string clears are NOT supported in v1 (null = leave).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
  if (!isPermitted(role, "profile.edit_core")) {
    return NextResponse.json(
      { error: "forbidden", decision: resolveGrant(role, "profile.edit_core") },
      { status: 403 },
    );
  }

  const id = params.id;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: {
    full_name?: unknown; phone_raw?: unknown; email?: unknown; city?: unknown;
    first_unit?: unknown; segment?: unknown; lifetime_value?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const fullName = str(body.full_name);
  const phoneRaw = str(body.phone_raw);
  const emailRaw = str(body.email);
  const city = str(body.city);
  const firstUnit = str(body.first_unit);
  const segment = str(body.segment);
  let lifetimeValue: number | null = null;
  if (body.lifetime_value != null && body.lifetime_value !== "") {
    const n = Number(body.lifetime_value);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "invalid_ltv", message: "Lifetime value harus angka." }, { status: 422 });
    }
    lifetimeValue = n;
  }

  // Validate email format if provided.
  let emailNormalized: string | null = null;
  if (emailRaw !== null) {
    emailNormalized = normalizeEmail(emailRaw);
    if (emailNormalized === null) {
      return NextResponse.json({ error: "email_invalid", message: "Format email tidak valid." }, { status: 422 });
    }
  }

  // Nothing to do?
  if (fullName === null && phoneRaw === null && emailRaw === null && city === null && firstUnit === null && segment === null && lifetimeValue === null) {
    return NextResponse.json({ error: "no_field", message: "Tidak ada field untuk diubah." }, { status: 422 });
  }

  // Defence in depth: the closed vocabularies (the RPC validates too, but a clean 422 beats a raised
  // SQL error). 20fit_data is accepted by the RPC but the UI never offers it (T3).
  if (segment !== null && !isSegmentValue(segment)) {
    return NextResponse.json({ error: "invalid_segment" }, { status: 422 });
  }
  if (firstUnit !== null && !isFirstUnitValue(firstUnit)) {
    return NextResponse.json({ error: "invalid_first_unit" }, { status: 422 });
  }
  if (lifetimeValue !== null && lifetimeValue < 0) {
    return NextResponse.json({ error: "invalid_ltv", message: "Lifetime value tak boleh negatif." }, { status: 422 });
  }

  const admin = createAdminClient();
  try {
    // Email uniqueness check — must happen before any writes.
    if (emailNormalized !== null) {
      const { data: dup } = await admin
        .from("master_customer")
        .select("customer_id")
        .eq("email_normalized", emailNormalized)
        .neq("customer_id", id)
        .limit(1)
        .maybeSingle();
      if (dup) {
        return NextResponse.json(
          { error: "email_taken", message: "Email ini sudah dipakai kontak lain." },
          { status: 409 },
        );
      }
    }

    // RPC handles name / phone / city / first_unit / segment / LTV.
    const hasRpcFields = fullName !== null || phoneRaw !== null || city !== null || firstUnit !== null || segment !== null || lifetimeValue !== null;
    let rpcChanged: string[] = [];
    let rpcCorrected: string[] = [];

    if (hasRpcFields) {
      const { data, error } = await admin.rpc("crm_update_master_fields", {
        p_customer_id: id,
        p_full_name: fullName,
        p_phone_raw: phoneRaw,
        p_city: city,
        p_first_unit: firstUnit,
        p_segment: segment,
        p_lifetime_value: lifetimeValue,
        p_actor_id: userId,
        p_actor_email: userEmail,
      });
      if (error) {
        logApiFailure("/audience/[id]/core", "rpc_raised", { code: (error as { code?: string })?.code });
        return NextResponse.json({ error: "update_rejected" }, { status: 422 });
      }
      const result = (data ?? {}) as { error?: string; changed?: string[]; corrected?: string[] };
      if (result.error === "phone_taken") {
        return NextResponse.json(
          { error: "phone_taken", message: "Nomor telepon ini sudah dipakai kontak lain." },
          { status: 409 },
        );
      }
      if (result.error === "row_merged") {
        return NextResponse.json(
          { error: "row_merged", message: "Profil ini sudah digabung ke profil lain — datanya sudah pindah." },
          { status: 409 },
        );
      }
      rpcChanged = result.changed ?? [];
      rpcCorrected = result.corrected ?? [];
    }

    // Email update via admin client (RPC doesn't accept email).
    if (emailNormalized !== null) {
      const { error: emailErr } = await admin
        .from("master_customer")
        .update({ email: emailRaw!, email_normalized: emailNormalized })
        .eq("customer_id", id);
      if (emailErr) {
        logApiFailure("/audience/[id]/core", "email_update_failed", { code: emailErr.code });
        return NextResponse.json({ error: "write_failed" }, { status: 500 });
      }
      rpcChanged = [...rpcChanged, "email"];
    }

    return NextResponse.json(
      { ok: true, changed: rpcChanged, corrected: rpcCorrected },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    logApiFailure("/audience/[id]/core", "rpc_threw", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}
