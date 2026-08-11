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

/** cf_hyrox sensitive columns — GATED (profile.view_health), masked by default, each reveal
 *  audited. NIK is a national identity number; this is the first place the project shows one. */
export const HYROX_SENSITIVE_COLUMNS = [
  "nik",
  "tgl_lahir",
  "gol_darah",
  "kontak_darurat",
  "no_kontak_darurat",
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

// ── Masking (server applies before any sensitive value can leave, K-02) ───────────────

/** Fully mask a sensitive value's PRESENCE without revealing any of it. A gated field is
 *  shown as this placeholder by default even to a permitted viewer; opening it is an
 *  explicit, audited action. We never reveal a partial (e.g. last-4 of a NIK) by default —
 *  a national ID number is not a field to leak a suffix of. */
export const MASKED_PLACEHOLDER = "•••••••";

/** Given a real value, the default masked form (presence only). Null stays null so the UI
 *  can say "not recorded" rather than showing a mask over nothing. */
export function maskSensitive(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === "") return null;
  return MASKED_PLACEHOLDER;
}

/** Which sensitive field kinds a reveal covered — recorded in the audit metadata (the KINDS,
 *  never the values). */
export type SensitiveKind = "nik" | "birthdate" | "blood_type" | "emergency_contact";
