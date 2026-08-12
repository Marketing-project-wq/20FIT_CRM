import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizePhoneID } from "./normalize";
import { phoneMatchCandidates, type MatchKey } from "./multisource-constants";
import {
  CLINIC_PATIENT_SAFE_COLUMNS,
  CLINIC_PATIENT_SENSITIVE_COLUMNS,
  CLINIC_BOOKING_SAFE_COLUMNS,
} from "./clinic-source-constants";
import type { ClinicCoverage } from "./quality-types";

/**
 * CLINIC chain (TUGAS 3) — READ-ONLY, server-only, service-role client passed in by the route.
 * The ENTIRE result is fetched + returned ONLY for a profile.view_health caller; for any other
 * role fetchProfileClinic returns { gated:false } and touches nothing (server-side omission,
 * not client masking).
 *
 * Match: clinic_patients PHONE-FIRST then email (measured: 12 vs 106 of 143), never by name.
 * The clinical tables chain via patient_id — never joined direct to master_customer.
 *
 * Shown: identity (patient_code + gated sensitive fields) + engagement COUNTS (head-count, no
 * content) + the latest booking. NOT shown: clinical content (diagnosis/results/medication/…);
 * those columns are never selected (CLINIC_FORBIDDEN_COLUMNS). ZERO write.
 *
 * clinic_transactions note (TUGAS 2, verified 12 Aug 2026): 2277/2477 rows have patient_id
 * NULL (unlinked spreadsheet import); the 200 linked rows are 100% valid. A per-patient count
 * therefore only ever includes THAT patient's linked rows — never the NULL ones — so it is
 * correct, not misleading. clinic_posture_scans (2) + clinic_patient_packages (6) are too
 * sparse to surface per-profile and are omitted here (reported in /quality instead).
 */

export interface ClinicSensitive {
  nik: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface ClinicCounts {
  bookings: number;
  visits: number;
  assessments: number;
  screenings: number;
  transactions: number; // linked (patient_id present) only
}

export interface ClinicLatestBooking {
  bookingCode: string | null;
  status: string | null;
  date: string | null;
}

export interface ProfileClinic {
  /** false when the caller lacks profile.view_health — nothing was fetched. */
  gated: boolean;
  matched: boolean;
  keyUsed: MatchKey | null;
  patientCode: string | null;
  sensitive: ClinicSensitive | null;
  counts: ClinicCounts | null;
  latestBooking: ClinicLatestBooking | null;
}

const NOT_GATED: ProfileClinic = {
  gated: false, matched: false, keyUsed: null, patientCode: null,
  sensitive: null, counts: null, latestBooking: null,
};
const NO_MATCH: ProfileClinic = {
  gated: true, matched: false, keyUsed: null, patientCode: null,
  sensitive: null, counts: null, latestBooking: null,
};

// ── COVERAGE (TUGAS 4): clinic reach for /quality. AGGREGATE counts only — no health
//    content, no per-patient rows — so this is NOT view_health gated (it is a data-quality
//    figure, and /quality is already gated on profile.view_list). ──────────────────────────

async function count(
  admin: SupabaseClient,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine?: (q: any) => any,
): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (refine) q = refine(q);
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

/** Distinct master profiles reachable from clinic_patients via one identity column. Emails are
 *  matched by normalizeEmail; phones by normalizePhoneID (both K-06). Small table (143), so a
 *  single pull is fine. */
async function clinicMatched(admin: SupabaseClient, by: "email" | "phone"): Promise<number> {
  const col = by === "email" ? "email" : "phone";
  const { data, error } = await admin.from("clinic_patients").select(col).not(col, "is", null);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, string | null>[];
  const keys = new Set<string>();
  for (const r of rows) {
    const k = by === "email" ? normalizeEmail(r[col]) : normalizePhoneID(r[col]);
    if (k) keys.add(k);
  }
  if (keys.size === 0) return 0;
  const masterCol = by === "email" ? "email_normalized" : "phone_normalized";
  const ids = new Set<string>();
  const list = Array.from(keys);
  const CHUNK = 300;
  for (let i = 0; i < list.length; i += CHUNK) {
    const { data: d, error: e } = await admin
      .from("master_customer")
      .select("customer_id")
      .in(masterCol, list.slice(i, i + CHUNK));
    if (e) throw e;
    for (const row of (d ?? []) as { customer_id: string }[]) ids.add(row.customer_id);
  }
  return ids.size;
}

export async function fetchClinicCoverage(admin: SupabaseClient): Promise<ClinicCoverage> {
  const [
    patientsRows, patientsWithPhone, patientsWithEmail,
    matchedByEmail, matchedByPhone,
    transactionsTotal, transactionsLinked,
    posture, packages,
  ] = await Promise.all([
    count(admin, "clinic_patients"),
    count(admin, "clinic_patients", (q) => q.not("phone", "is", null)),
    count(admin, "clinic_patients", (q) => q.not("email", "is", null)),
    clinicMatched(admin, "email"),
    clinicMatched(admin, "phone"),
    count(admin, "clinic_transactions"),
    count(admin, "clinic_transactions", (q) => q.not("patient_id", "is", null)),
    count(admin, "clinic_posture_scans"),
    count(admin, "clinic_patient_packages"),
  ]);
  return {
    patientsRows, patientsWithPhone, patientsWithEmail, matchedByEmail, matchedByPhone,
    transactionsTotal, transactionsLinked, transactionsNullFk: transactionsTotal - transactionsLinked,
    sparse: [
      { table: "clinic_posture_scans", rows: posture },
      { table: "clinic_patient_packages", rows: packages },
    ],
  };
}

async function countByPatient(admin: SupabaseClient, table: string, patientId: string): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("patient_id", patientId);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchProfileClinic(
  admin: SupabaseClient,
  customerId: string,
  opts: { canViewHealth: boolean },
): Promise<ProfileClinic> {
  if (!opts.canViewHealth) return NOT_GATED; // health data never leaves the server for others.

  // Profile identity, server-side only.
  const { data: prof, error: profErr } = await admin
    .from("master_customer")
    .select("email_normalized, phone_normalized")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (profErr) throw profErr;
  const p = prof as { email_normalized: string | null; phone_normalized: string | null } | null;
  const email = normalizeEmail(p?.email_normalized ?? null);
  const phone = normalizePhoneID(p?.phone_normalized ?? null);
  if (!email && !phone) return NO_MATCH;

  const selectCols = [
    "id",
    ...CLINIC_PATIENT_SAFE_COLUMNS,
    ...CLINIC_PATIENT_SENSITIVE_COLUMNS,
  ].join(",");

  // PHONE FIRST (12 vs 106), then email. Record which key matched.
  let patient: Record<string, unknown> | null = null;
  let keyUsed: MatchKey | null = null;

  const candidates = phone ? phoneMatchCandidates(phone) : [];
  if (candidates.length > 0) {
    const { data, error } = await admin
      .from("clinic_patients")
      .select(selectCols)
      .in("phone", candidates)
      .limit(1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length > 0) { patient = rows[0]; keyUsed = "phone"; }
  }
  if (!patient && email) {
    const { data, error } = await admin
      .from("clinic_patients")
      .select(selectCols)
      .ilike("email", email)
      .limit(1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length > 0) { patient = rows[0]; keyUsed = "email"; }
  }

  if (!patient) return NO_MATCH;

  const patientId = String(patient.id);

  // Engagement volume — counts only, no clinical content read.
  const [bookings, visits, assessments, screenings, transactions] = await Promise.all([
    countByPatient(admin, "clinic_bookings", patientId),
    countByPatient(admin, "clinic_visits", patientId),
    countByPatient(admin, "clinic_assessments", patientId),
    countByPatient(admin, "clinic_screenings", patientId),
    countByPatient(admin, "clinic_transactions", patientId),
  ]);

  // Latest booking for scheduling context (safe columns only).
  const { data: bk, error: bkErr } = await admin
    .from("clinic_bookings")
    .select(CLINIC_BOOKING_SAFE_COLUMNS.join(","))
    .eq("patient_id", patientId)
    .order("manual_date", { ascending: false, nullsFirst: false })
    .limit(1);
  if (bkErr) throw bkErr;
  const latest = ((bk ?? []) as unknown as Record<string, unknown>[])[0] as Record<string, unknown> | undefined;

  return {
    gated: true,
    matched: true,
    keyUsed,
    patientCode: (patient.patient_code as string) ?? null,
    sensitive: {
      nik: (patient.id_number as string) ?? null,
      dateOfBirth: (patient.date_of_birth as string) ?? null,
      gender: (patient.gender as string) ?? null,
      address: (patient.address as string) ?? null,
      emergencyContactName: (patient.emergency_contact_name as string) ?? null,
      emergencyContactPhone: (patient.emergency_contact_phone as string) ?? null,
    },
    counts: { bookings, visits, assessments, screenings, transactions },
    latestBooking: latest
      ? {
          bookingCode: (latest.booking_code as string) ?? null,
          status: (latest.status as string) ?? null,
          date: (latest.manual_date as string) ?? null,
        }
      : null,
  };
}
