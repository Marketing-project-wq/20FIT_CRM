/**
 * Constants + PURE helpers for profile enrichment from unmatched ecosystem sources
 * (Sprint 3R — the deferred 3P TUGAS 2). Client-safe: the profile UI imports the field
 * lists + the masking helpers. The service-role query code is in lib/crm/enrichment.ts
 * (server-only). Same split as engagement-constants.ts.
 *
 * These sources have NO customer_id; they are matched to a profile by NORMALISED EMAIL
 * (normalize.ts, K-06) — never by raw string, never by name. `rc_team_members` is keyed by
 * name only and is therefore NOT matched at all (a wrong name-match glues one person's race
 * history to another's profile — an error invisible until someone is contacted on it).
 *
 * ZERO write path, ZERO copy into master_customer / crm_*. Read + join at display time.
 * The column lists below are the ONLY columns read; a guard test enforces that the sensitive
 * / health / internal columns never enter a safe list.
 */

// ── SAFE (non-sensitive) columns per source ──────────────────────────────────────────

/** cf_hyrox_participants — event participation facts (NOT identity/health). registered_at
 *  is a REAL event date (unlike the load-stamp columns elsewhere). */
export const HYROX_SAFE_COLUMNS = [
  "event_name",
  "kategori",
  "nama_tim",
  "posisi",
  "registered_at",
] as const;

/**
 * cf_hyrox sensitive columns — split by GATE (K-31, 19 Agu 2026):
 *   - IDENTITY (nik, tgl_lahir, kontak_darurat, no_kontak_darurat) → `profile.view_contact`.
 *     NIK is a national identity number, sekelas telepon/email; it (and the DOB/emergency it
 *     carries) rides the contact gate, not the health gate.
 *   - MEDICAL (gol_darah) → `profile.view_health`. Blood type is medical BY NATURE even though it
 *     sits in the same Hyrox row as NIK — gated by its nature, not its neighbour.
 * HYROX_SENSITIVE_COLUMNS stays the UNION (identity ∪ medical) so the safe-list guard still sees
 * every sensitive name; the two sub-lists drive the per-gate column selection in enrichment.ts.
 */
export const HYROX_IDENTITY_COLUMNS = [
  "nik",
  "tgl_lahir",
  "kontak_darurat",
  "no_kontak_darurat",
] as const;

export const HYROX_MEDICAL_COLUMNS = ["gol_darah"] as const;

export const HYROX_SENSITIVE_COLUMNS = [
  ...HYROX_IDENTITY_COLUMNS,
  ...HYROX_MEDICAL_COLUMNS,
] as const;

/** cf_hyrox columns that must NEVER be read (internal keys + the nik-validity flag). */
export const HYROX_FORBIDDEN_COLUMNS = ["id", "source_row", "no_urut", "nik_valid"] as const;

/** my20fit_profile — presence + membership only. HEALTH/BODY/CYCLE columns are deliberately
 *  EXCLUDED: medical data needs its own processing basis and crm_consent is still empty
 *  (same line drawn as clinic_*). fitco linkage is surfaced as a boolean, never the id. */
export const MY20FIT_PROFILE_SAFE_COLUMNS = [
  "is_plus_member",
  "onboarding_completed",
  "created_at",
] as const;

/** my20fit_profile columns that must NEVER be read (health/body/cycle + identifiers). */
export const MY20FIT_PROFILE_FORBIDDEN_COLUMNS = [
  "health_conditions",
  "cycle_last_period",
  "last_period_date",
  "period_length",
  "cycle_length",
  "height_cm",
  "weight_kg",
  "age",
  "auth_user_id",
] as const;

/** my20fit_user_activity — the ONLY source with real recency. last_active_at is genuine
 *  (not a load stamp), ping_count is a real visit count. Both non-sensitive. */
export const MY20FIT_ACTIVITY_SAFE_COLUMNS = [
  "first_seen_at",
  "last_active_at",
  "ping_count",
] as const;

/** Sensitive field kinds — recorded (the KINDS, never the values) in the profile.viewed
 *  audit metadata when a view_health caller opens a profile. */
export type SensitiveKind = "nik" | "birthdate" | "blood_type" | "emergency_contact";
