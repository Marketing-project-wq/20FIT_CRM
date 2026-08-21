import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * crm_profile_demographic read layer (Sprint NIK-2) — the STAFF-ENTRY slot of the demographic
 * priority chain (position 4: present only when every other source was empty; its write path,
 * crm_upsert_profile_demographic, is fill-empty-only). READ-ONLY, server-only.
 *
 * gender + date_of_birth are IDENTITY, so this is fetched only for a `canSeeContact` caller
 * (profile.view_contact) — the same gate as the NIK/DOB it competes with in the chain. No write.
 * Keyed directly by customer_id (this is a CRM-owned table, not an email-matched ecosystem source).
 */

export interface ProfileDemographic {
  /** false when the caller lacks profile.view_contact — nothing was fetched. */
  gated: boolean;
  gender: string | null; // "male" | "female" (schema CHECK); normalised by the picker
  dateOfBirth: string | null; // ISO yyyy-mm-dd (a `date` column)
}

const NOT_GATED: ProfileDemographic = { gated: false, gender: null, dateOfBirth: null };

export async function fetchProfileDemographic(
  admin: SupabaseClient,
  customerId: string,
  opts: { canSeeContact: boolean },
): Promise<ProfileDemographic> {
  if (!opts.canSeeContact) return NOT_GATED;
  const { data, error } = await admin
    .from("crm_profile_demographic")
    .select("gender, date_of_birth")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { gender: string | null; date_of_birth: string | null } | null;
  return {
    gated: true,
    gender: row?.gender ?? null,
    dateOfBirth: row?.date_of_birth ?? null,
  };
}
