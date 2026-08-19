import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, canSeeContactPII, canSeeMedical, resolveGrant } from "@/lib/auth/roles";
import { isUuid } from "@/lib/crm/audience";
import { fetchProfileEnrichment } from "@/lib/crm/enrichment";
import { fetchProfileClinic } from "@/lib/crm/clinic-source";
import { fetchProfileImport } from "@/lib/crm/staging";
import { fetchProfileDemographic } from "@/lib/crm/demographic-read";
import { pickBirthDate, pickGender, normalizeGender } from "@/lib/crm/demographic-pick";
import { upsertProfileDemographic, isGender, isIsoDate } from "@/lib/crm/demographic-write";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * WRITE path: fill EMPTY demographic fields (gender / birth date) for a profile — the staff-entry
 * slot of the demographic chain (Sprint NIK-3). It is FILL-EMPTY-ONLY at two layers:
 *   1. Here (route): the field is resolved across EVERY source (NIK / staging / clinic / prior
 *      staff entry) and a write is REJECTED (409) if that field already has a value. Correcting an
 *      existing value is a separate decision, not offered.
 *   2. In the DB: crm_upsert_profile_demographic is itself fill-empty-only + atomic (K-14) and
 *      writes its own `profile.demographic_updated` audit row — this route writes NO audit itself.
 *
 * Gate: profile.edit_demographic (EXTENSION beyond PRD 17.2, K-32) — super_admin, crm_manager,
 * crm_operator, data_steward; unit_manager fail-closed; analyst denied. Enforced server-side.
 * master_customer is NEVER touched. *_source is set to 'staff_entry' inside the RPC.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
  if (!isPermitted(role, "profile.edit_demographic")) {
    return NextResponse.json(
      { error: "forbidden", decision: resolveGrant(role, "profile.edit_demographic") },
      { status: 403 },
    );
  }

  const id = params.id;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { gender?: unknown; date_of_birth?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Validate the two supported fields. At least one must be present.
  const wantGender = body.gender != null && body.gender !== "";
  const wantDob = body.date_of_birth != null && body.date_of_birth !== "";
  if (!wantGender && !wantDob) {
    return NextResponse.json({ error: "no_field", message: "Tidak ada field untuk diisi." }, { status: 422 });
  }
  if (wantGender && !isGender(body.gender)) {
    return NextResponse.json({ error: "invalid_gender", message: "Gender harus male atau female." }, { status: 422 });
  }
  if (wantDob && !isIsoDate(body.date_of_birth)) {
    return NextResponse.json({ error: "invalid_date", message: "Tanggal lahir harus yyyy-mm-dd yang valid." }, { status: 422 });
  }

  const admin = createAdminClient();
  const canSeeContact = canSeeContactPII(role);
  const canViewHealth = canSeeMedical(role);

  // Ensure the profile exists (and get a stable target). Then resolve the CURRENT value of each
  // field across ALL sources — the write is offered only for fields still empty everywhere.
  let exists = false;
  try {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id")
      .eq("customer_id", id)
      .maybeSingle();
    if (error) throw error;
    exists = !!data;
  } catch (e) {
    logApiFailure("/audience/[id]/demographic", "profile_lookup_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Resolve current demographic across every source the editor can see.
  let dobFilled = false;
  let genderFilled = false;
  try {
    const [enrichment, clinic, importData, demographic] = await Promise.all([
      fetchProfileEnrichment(admin, id, { canSeeContact, canSeeMedical: canViewHealth }),
      fetchProfileClinic(admin, id, { canSeeContact, canSeeMedical: canViewHealth }),
      fetchProfileImport(admin, id, { canSeeMedical: canViewHealth }),
      fetchProfileDemographic(admin, id, { canSeeContact }),
    ]);
    const hs = enrichment.hyrox.sensitive;
    const nd = enrichment.hyrox.nikDerived;
    const cs = clinic.sensitive;
    const staging = importData.dob;
    const iso = (s: string | null | undefined) => (s && /^(\d{4}-\d{2}-\d{2})/.exec(String(s)) ? /^(\d{4}-\d{2}-\d{2})/.exec(String(s))![1] : null);
    const dob = pickBirthDate({
      nik: nd?.valid ? { iso: iso(nd.birthDate) } : null,
      staging: staging && staging.status === "parsed" ? { iso: iso(staging.iso) } : null,
      clinic: { iso: iso(cs?.dateOfBirth) },
      hyrox: { iso: iso(hs?.tglLahir) },
      staff: { iso: iso(demographic.dateOfBirth) },
    });
    const gender = pickGender({
      nik: nd?.valid ? (nd.gender ?? null) : null,
      clinic: normalizeGender(cs?.gender),
      staff: normalizeGender(demographic.gender),
    });
    dobFilled = dob.iso != null;
    genderFilled = gender.value != null;
  } catch (e) {
    logApiFailure("/audience/[id]/demographic", "resolve_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Reject a write to a field that is already filled from any source (fill-empty-only, layer 1).
  const rejected: string[] = [];
  if (wantGender && genderFilled) rejected.push("gender");
  if (wantDob && dobFilled) rejected.push("date_of_birth");
  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error: "already_filled",
        fields: rejected,
        message: "Field ini sudah terisi dari sumber lain — koreksi adalah keputusan tersendiri, tidak lewat jalur ini.",
      },
      { status: 409 },
    );
  }

  // Only the truly-empty fields reach the RPC (which is itself fill-empty-only + atomic + audited).
  try {
    const result = await upsertProfileDemographic(admin, {
      customerId: id,
      gender: wantGender ? (body.gender as "male" | "female") : null,
      dateOfBirth: wantDob ? (body.date_of_birth as string) : null,
      actorId: userId,
      actorEmail: userEmail,
    });
    return NextResponse.json(
      { ok: true, customer_id: result.customerId, fields: result.fields, audit_id: result.auditId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    logApiFailure("/audience/[id]/demographic", "rpc_write_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}
