/**
 * Constants + PURE decisions for the CLINIC chain (TUGAS 3). Client-safe: the profile UI
 * imports the field lists. The service-role query code is in lib/crm/clinic-source.ts
 * (server-only). SEPARATE from multisource-constants.ts on purpose — clinic is health data.
 *
 * GATE: the ENTIRE clinic section is fetched + returned ONLY for a profile.view_health caller
 * (super_admin / crm_manager, PRD 17.2). For any other role it is not fetched at all — omitted
 * from the server response, never masked in the browser.
 *
 * MATCH: clinic_patients is matched PHONE-FIRST (measured 12 Aug 2026: email matches 12/143
 * patients, phone matches 106 — see matchKeyOrder). Then the clinical tables chain via
 * patient_id — NEVER joined directly to master_customer. Never matched by name.
 *
 * WHAT IS SHOWN, AND WHAT IS DELIBERATELY NOT (this is a decision, not an implementation
 * detail): CS needs to RECOGNISE the patient and know their appointment / engagement context,
 * NOT read their medical record. So we surface:
 *   - identity essentials to confirm who is on the line: patient_code + the sensitive id
 *     fields (NIK / DOB / gender / address / emergency contact) — gated + audited as KINDS.
 *   - engagement VOLUME as counts only (bookings / visits / assessments / screenings /
 *     transactions) — head-count, no content rows read.
 *   - the latest booking (code / status / date) for scheduling context.
 * We DO NOT surface clinical CONTENT — diagnosis, screening results, assessment detail,
 * medication, surgery, posture-scan detail, package detail. A CS screen that shows a full
 * diagnosis while staff merely confirm a schedule is exposure with no workflow need. Those
 * columns are in the FORBIDDEN set and are never selected.
 */

/** clinic_patients — non-sensitive identity context. */
export const CLINIC_PATIENT_SAFE_COLUMNS = ["patient_code", "is_active"] as const;

/** clinic_patients — SENSITIVE identity, GATED (view_health), values NEVER in audit metadata
 *  (only the KINDS). These are what CS uses to VERIFY identity, not clinical content. */
export const CLINIC_PATIENT_SENSITIVE_COLUMNS = [
  "id_number", // NIK
  "date_of_birth",
  "gender",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

/** clinic_bookings — scheduling context only (no clinical content, no free-text notes). */
export const CLINIC_BOOKING_SAFE_COLUMNS = ["booking_code", "status", "manual_date"] as const;

/**
 * Columns that must NEVER be selected from ANY clinic table — clinical CONTENT + free text +
 * raw contact identity (already matched on). The guard test asserts no safe list intersects
 * this, and it documents the deliberate omission of the medical record from the CS screen.
 */
export const CLINIC_FORBIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  "notes",
  "email",
  "phone",
  "diagnosis",
  "diagnoses",
  "icd10",
  "icd_10",
  "result",
  "results",
  "screening_result",
  "assessment",
  "assessment_detail",
  "medication",
  "medications",
  "surgery",
  "surgeries",
  "treatment",
  "complaint",
  "anamnesis",
  "posture",
  "posture_result",
  "lmp",
  "last_period",
]);

/** Sensitive field KINDS recorded (KINDS, never values) in the ONE profile.viewed audit row. */
export type ClinicSensitiveKind = "nik" | "birthdate" | "address" | "emergency_contact";
