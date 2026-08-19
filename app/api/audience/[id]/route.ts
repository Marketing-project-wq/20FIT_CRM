import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import {
  canViewProfileList,
  shouldMaskContact,
  canSeeContactPII,
  canSeeMedical,
  resolveGrant,
} from "@/lib/auth/roles";
import { fetchProfileById, isUuid } from "@/lib/crm/audience";
import { fetchProfileEngagement, type ProfileEngagement } from "@/lib/crm/engagement";
import { fetchProfileEnrichment, type ProfileEnrichment } from "@/lib/crm/enrichment";
import { fetchProfileMultiSource, type ProfileMultiSource } from "@/lib/crm/multisource";
import { fetchProfileClinic, type ProfileClinic } from "@/lib/crm/clinic-source";
import { fetchProfileImport, type ProfileImport } from "@/lib/crm/staging";
import { fetchProfileDemographic, type ProfileDemographic } from "@/lib/crm/demographic-read";
import { fetchProfileMirrorPresence, fetchMirrorMeta, type MirrorPresence } from "@/lib/crm/mirror";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Single-profile detail. Returns ONE individual row and is keyed by a user-supplied
 * id, so by the project audit rule it MUST audit: one `profile.viewed` row per open,
 * target_id = customer_id. An unlogged read is refused (503).
 *
 * Enforcement, all server-side:
 *   1. Signed in -> 401.
 *   2. FAIL-CLOSED on profile.view_list (to open a row you must be allowed the list).
 *   3. Masking of phone/email for any role without profile.view_contact — same server
 *      rule as the list; the real value never reaches the browser.
 *   4. Unknown / malformed id -> 404, IDENTICAL to "exists but you can't see it would
 *      never happen here" — there is exactly one 404 shape, so this endpoint cannot be
 *      used to enumerate which ids exist.
 *   5. Health flags are gated on profile.view_health SEPARATELY (super_admin,
 *      crm_manager) — but master_customer has NO health column, so even a permitted
 *      viewer is told "no data source", never a blank that reads as "healthy".
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    return NextResponse.json(
      { error: "forbidden", decision: resolveGrant(role, "profile.view_list") },
      { status: 403 },
    );
  }

  const id = params.id;
  // Malformed id -> the SAME 404 as a non-existent one (no enumeration signal).
  if (!isUuid(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const masked = shouldMaskContact(role);
  const admin = createAdminClient();

  let profile;
  try {
    profile = await fetchProfileById(admin, id, masked);
  } catch (e) {
    logApiFailure("/audience/[id]", "profile_query_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The two sensitive-field gates, from the single source (roles.ts, K-31): identity (NIK/DOB/
  // gender/address/emergency) rides `profile.view_contact`; medical (blood type, clinical
  // involvement) rides `profile.view_health`. Everything downstream derives from these two.
  const canSeeContact = canSeeContactPII(role);
  const canViewHealth = canSeeMedical(role);

  // Ecosystem touchpoints (customer_engagement), keyed by customer_id. NON-fatal and
  // NON-audited: the mandatory profile.viewed row below accounts for opening this profile —
  // the ecosystem read is part of the same view, not a separate action.
  let engagement: ProfileEngagement | null = null;
  try {
    engagement = await fetchProfileEngagement(admin, profile.customer_id);
  } catch (e) {
    logApiFailure("/audience/[id]", "engagement_query_failed", { code: (e as { code?: string })?.code });
    engagement = null;
  }

  // Enrichment from unmatched ecosystem sources (Hyrox / my20fit), matched by normalised
  // email server-side. Non-fatal. Sensitive Hyrox fields are fetched + returned UNMASKED
  // ONLY for a view_health caller; omitted entirely for any other role.
  let enrichment: ProfileEnrichment | null = null;
  try {
    enrichment = await fetchProfileEnrichment(admin, profile.customer_id, { canSeeContact, canSeeMedical: canViewHealth });
  } catch (e) {
    logApiFailure("/audience/[id]", "enrichment_query_failed", { code: (e as { code?: string })?.code });
    enrichment = null;
  }

  // Multi-source completion (TUGAS 3): arena/gym booking sources matched by normalised email
  // then phone. Non-fatal, read-only, no sensitive fields (clinic chain is separate/deferred).
  let multiSource: ProfileMultiSource | null = null;
  try {
    multiSource = await fetchProfileMultiSource(admin, profile.customer_id);
  } catch (e) {
    logApiFailure("/audience/[id]", "multisource_query_failed", { code: (e as { code?: string })?.code });
    multiSource = null;
  }

  // Clinic chain (TUGAS 3): the WHOLE section is fetched ONLY for a view_health caller —
  // fetchProfileClinic returns { gated:false } and touches nothing for any other role.
  // Matched phone-first (12 vs 106), chained via patient_id, counts only (no clinical content).
  let clinic: ProfileClinic | null = null;
  try {
    clinic = await fetchProfileClinic(admin, profile.customer_id, { canSeeContact, canSeeMedical: canViewHealth });
  } catch (e) {
    logApiFailure("/audience/[id]", "clinic_query_failed", { code: (e as { code?: string })?.code });
    clinic = null;
  }

  // staging_20fit_data completion (Sprint 3Y): birth date, city, RFM, program participation,
  // matched by normalised email. Non-fatal, read-only, no copy. Clinic-patient program flags are
  // server-omitted for non-view_health callers (being a clinic patient infers health status).
  let importData: ProfileImport | null = null;
  try {
    importData = await fetchProfileImport(admin, profile.customer_id, { canSeeMedical: canViewHealth });
  } catch (e) {
    logApiFailure("/audience/[id]", "staging_query_failed", { code: (e as { code?: string })?.code });
    importData = null;
  }

  // Staff-entered demographic (crm_profile_demographic) — the chain's last-resort DOB/gender slot.
  // Identity, so fetched only for a canSeeContact caller. Non-fatal.
  let demographic: ProfileDemographic | null = null;
  try {
    demographic = await fetchProfileDemographic(admin, profile.customer_id, { canSeeContact });
  } catch (e) {
    logApiFailure("/audience/[id]", "demographic_query_failed", { code: (e as { code?: string })?.code });
    demographic = null;
  }

  // Mirror presence flags for THIS profile (Sprint 5B) — the "connected to / not connected to"
  // snapshot, read from one pre-joined row, plus the mirror's freshness. Non-fatal + does NOT
  // gate the live detail fetches above: those still run unconditionally, so a stale snapshot can
  // never hide a real connection. The client only uses these to build the consolidated
  // "not connected to …" line and to stamp it with the snapshot's age.
  let mirror: MirrorPresence | null = null;
  let mirrorRefreshedAt: string | null = null;
  try {
    [mirror, mirrorRefreshedAt] = await Promise.all([
      fetchProfileMirrorPresence(admin, profile.customer_id),
      fetchMirrorMeta(admin).then((m) => m.refreshedAt),
    ]);
  } catch (e) {
    logApiFailure("/audience/[id]", "mirror_query_failed", { code: (e as { code?: string })?.code });
    mirror = null;
    mirrorRefreshedAt = null;
  }

  // Which sensitive field KINDS were available to this caller — recorded in the ONE
  // profile.viewed row (K-07), never the values, never a row per field (T2 rule). Identity kinds
  // are recorded when the caller could see them (canSeeContact); blood_type only under view_health.
  // The NIK VALUE never enters metadata — only that a field OF KIND "nik" was shown.
  const sensitiveFields = new Set<string>();
  if (enrichment?.hyrox.sensitive) {
    const s = enrichment.hyrox.sensitive;
    if (s.nik) sensitiveFields.add("nik");
    if (s.tglLahir) sensitiveFields.add("birthdate");
    if (s.golDarah) sensitiveFields.add("blood_type");
    if (s.kontakDarurat || s.noKontakDarurat) sensitiveFields.add("emergency_contact");
  }
  if (clinic?.matched && clinic.sensitive) {
    const s = clinic.sensitive;
    if (s.nik) sensitiveFields.add("nik");
    if (s.dateOfBirth) sensitiveFields.add("birthdate");
    if (s.address) sensitiveFields.add("address");
    if (s.emergencyContactName || s.emergencyContactPhone) sensitiveFields.add("emergency_contact");
  }

  // Mandatory audit — individual row. Refuse to serve if it can't be logged.
  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "profile.viewed",
    target_table: "master_customer",
    target_id: profile.customer_id,
    summary: `Profil dibuka${masked ? " (kontak disamarkan)" : ""}.`,
    // NON-PII: identity is carried by target_id; only view context + the KINDS of sensitive
    // field shown (never their values, which the metadata rule forbids).
    metadata: {
      view: "profile_detail",
      masked,
      ...(sensitiveFields.size > 0 ? { sensitive_fields: Array.from(sensitiveFields) } : {}),
    },
  });
  if (auditError) {
    logApiFailure("/audience/[id]", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: "Pembacaan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { profile, canViewHealth, canSeeContact, engagement, enrichment, multiSource, clinic, importData, demographic, mirror, mirrorRefreshedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
