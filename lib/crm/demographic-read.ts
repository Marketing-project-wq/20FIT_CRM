import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * crm_profile_demographic read layer (Sprint NIK-2) — the crm_profile_demographic slots of the
 * demographic priority chain. READ-ONLY, server-only.
 *
 * NOT a single "staff" slot (T-35): this table is written by TWO paths with different trust. The
 * staff fill-empty path (crm_upsert_profile_demographic) writes *_source='staff_entry'; a separate
 * external batch of 248 rows carries *_source='progressive_profiling'. So the row's PER-FIELD
 * `*_source` is read out too, and the picker routes each value to the `staff` or `progressive` slot
 * via demographicProvenance — the source is inspected, never assumed to be staff.
 *
 * gender + date_of_birth are IDENTITY, so this is fetched only for a `canSeeContact` caller
 * (profile.view_contact) — the same gate as the NIK/DOB it competes with in the chain. No write.
 * Keyed directly by customer_id (this is a CRM-schema table, not an email-matched ecosystem source).
 */

export interface ProfileDemographic {
  /** false when the caller lacks profile.view_contact — nothing was fetched. */
  gated: boolean;
  gender: string | null; // "male" | "female" (schema CHECK); normalised by the picker
  genderSource: string | null; // 'staff_entry' | 'progressive_profiling' | 'backfill_*' | null
  dateOfBirth: string | null; // ISO yyyy-mm-dd (a `date` column)
  dateOfBirthSource: string | null; // provenance of date_of_birth (see genderSource)
}

const NOT_GATED: ProfileDemographic = {
  gated: false,
  gender: null,
  genderSource: null,
  dateOfBirth: null,
  dateOfBirthSource: null,
};

export async function fetchProfileDemographic(
  admin: SupabaseClient,
  customerId: string,
  opts: { canSeeContact: boolean },
): Promise<ProfileDemographic> {
  if (!opts.canSeeContact) return NOT_GATED;
  const { data, error } = await admin
    .from("crm_profile_demographic")
    .select("gender, gender_source, date_of_birth, date_of_birth_source")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    gender: string | null;
    gender_source: string | null;
    date_of_birth: string | null;
    date_of_birth_source: string | null;
  } | null;
  return {
    gated: true,
    gender: row?.gender ?? null,
    genderSource: row?.gender_source ?? null,
    dateOfBirth: row?.date_of_birth ?? null,
    dateOfBirthSource: row?.date_of_birth_source ?? null,
  };
}
