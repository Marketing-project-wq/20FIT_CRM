import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canImportAudience } from "@/lib/auth/roles";
import { normalizeEmail, normalizePhoneID } from "@/lib/crm/normalize";
import { isOperatorTag } from "@/lib/crm/tags";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

interface AddContactBody {
  email?: string;
  fullName?: string;
  phone?: string;
  gender?: string;
  city?: string;
  dateOfBirth?: string;
  bloodType?: string;
  tags?: string[];
}

export async function POST(req: Request) {
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
  if (!userId) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Sesi berakhir — muat ulang halaman." },
      { status: 401 },
    );
  }

  const role = await getCurrentUserRole();
  if (!canImportAudience(role)) {
    return NextResponse.json(
      { error: "forbidden", message: "Hanya Super Admin yang boleh menambah kontak." },
      { status: 403 },
    );
  }

  let body: AddContactBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!emailRaw) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(emailRaw);
  if (!emailNorm) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() || null : null;
  const phoneNorm = phoneRaw ? normalizePhoneID(phoneRaw) : null;
  const gender = body.gender === "L" || body.gender === "P" ? body.gender : null;
  const city = typeof body.city === "string" ? body.city.trim() || null : null;
  const bloodType =
    typeof body.bloodType === "string" && ["A", "B", "AB", "O"].includes(body.bloodType)
      ? body.bloodType
      : null;

  let dateOfBirth: string | null = null;
  if (typeof body.dateOfBirth === "string" && body.dateOfBirth.trim()) {
    const d = body.dateOfBirth.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      dateOfBirth = d;
    }
  }

  const tags: string[] = [];
  if (Array.isArray(body.tags)) {
    for (const t of body.tags) {
      if (typeof t === "string" && isOperatorTag(t)) tags.push(t);
    }
  }

  const admin = createAdminClient();
  const batchId = crypto.randomUUID();

  const { data: existing, error: selectErr } = await admin
    .from("master_customer")
    .select("customer_id")
    .eq("email_normalized", emailNorm)
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    logApiFailure("/audience/add-contact", "select_failed", { code: selectErr.code });
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  let outcome: "inserted" | "updated";

  if (existing) {
    try {
      const { data, error: upErr } = await admin.rpc("crm_update_master_fields", {
        p_customer_id: existing.customer_id,
        p_full_name: fullName,
        p_phone_raw: phoneNorm ? phoneRaw : null,
        p_city: city,
        p_first_unit: null,
        p_segment: null,
        p_lifetime_value: null,
        p_gender: gender,
        p_date_of_birth: dateOfBirth,
        p_blood_type: bloodType,
        p_actor_id: userId,
        p_actor_email: userEmail,
      });
      if (upErr) {
        logApiFailure("/audience/add-contact", "rpc_raised", { code: upErr.code });
        console.error("[api /audience/add-contact] rpc_raised detail", {
          message: (upErr as { message?: string }).message,
          hint: (upErr as { hint?: string }).hint,
        });
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
      }
      const res = (data ?? {}) as { error?: string; changed?: string[]; corrected?: string[] };
      if (res.error === "row_merged") {
        return NextResponse.json(
          { error: "row_merged", message: "Profil sudah digabung ke profil lain." },
          { status: 409 },
        );
      }
      if (res.error === "phone_taken") {
        return NextResponse.json(
          { error: "phone_taken", message: "Nomor telepon sudah dipakai kontak lain." },
          { status: 409 },
        );
      }
    } catch (e) {
      logApiFailure("/audience/add-contact", "rpc_threw", { code: (e as { code?: string })?.code });
      console.error("[api /audience/add-contact] rpc_threw detail", {
        message: (e as { message?: string })?.message,
      });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    if (tags.length > 0) {
      const tagRows = [{ email: emailNorm, tags }];
      await admin.rpc("crm_ingest_csv_people", {
        p_rows: [],
        p_batch_id: batchId,
        p_collection_source: "single_add",
        p_uploaded_by: userId,
        p_tag_rows: tagRows,
      });
    }

    outcome = "updated";
  } else {
    const payload = [
      {
        full_name: fullName,
        email: emailRaw,
        email_normalized: emailNorm,
        phone_normalized: phoneNorm,
        city,
        gender,
        date_of_birth: dateOfBirth,
        blood_type: bloodType,
        tags,
      },
    ];

    const { error: rpcErr } = await admin.rpc("crm_ingest_csv_people", {
      p_rows: payload,
      p_batch_id: batchId,
      p_collection_source: "single_add",
      p_uploaded_by: userId,
      p_tag_rows: [],
    });
    if (rpcErr) {
      logApiFailure("/audience/add-contact", "insert_rpc_raised", { code: rpcErr.code });
      console.error("[api /audience/add-contact] insert_rpc_raised detail", {
        message: (rpcErr as { message?: string }).message,
        hint: (rpcErr as { hint?: string }).hint,
      });
      return NextResponse.json({ error: "insert_failed", code: rpcErr.code }, { status: 500 });
    }

    outcome = "inserted";
  }

  await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "audience.imported",
    target_table: "master_customer",
    summary: `Tambah kontak tunggal: ${emailNorm} (${outcome})`,
    metadata: { outcome, email: emailNorm, source: "single_add" },
  });

  try {
    await admin.rpc("crm_refresh_customer_mirror");
  } catch {
    // mirror refresh failure is not fatal
  }

  return NextResponse.json({ ok: true, outcome });
}
