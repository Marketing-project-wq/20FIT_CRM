import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGender, isIsoDate, type GenderInput } from "./demographic-pick";

// Re-export the pure validators so server callers can import them alongside the writer. Their
// definitions live in the client-safe demographic-pick module (server-only can't be imported into
// unit tests), keeping one source for the input rules.
export { isGender, isIsoDate };
export type { GenderInput };

/**
 * WRITE path for staff-entered demographic (Sprint NIK-3). Thin wrapper over the ATOMIC RPC
 * crm_upsert_profile_demographic (migration 20260819113649, K-14): fill-empty-only upsert into
 * crm_profile_demographic + a `profile.demographic_updated` audit row in ONE transaction. There is
 * NO second write path — the RPC is the only writer, and it never touches master_customer.
 *
 * This wrapper does NOT write an audit row itself (the RPC does, transactionally — a second write
 * here would double-count). It only validates + forwards. `*_source` is set to 'staff_entry' inside
 * the function; the metadata is field NAMES only (non-PII). Values that would overwrite an already
 * -filled field are IGNORED by the RPC (fill-empty-only) — correcting an existing value is a
 * separate decision, not offered here.
 */

export interface DemographicWriteInput {
  customerId: string;
  gender?: GenderInput | null;
  /** ISO yyyy-mm-dd. */
  dateOfBirth?: string | null;
  actorId: string | null;
  actorEmail: string | null;
}

export interface DemographicWriteResult {
  customerId: string;
  /** The field names actually filled (empty ones only). */
  fields: string[];
  auditId: number | null;
}

export async function upsertProfileDemographic(
  admin: SupabaseClient,
  input: DemographicWriteInput,
): Promise<DemographicWriteResult> {
  const { data, error } = await admin.rpc("crm_upsert_profile_demographic", {
    p_customer_id: input.customerId,
    p_gender: input.gender ?? null,
    p_date_of_birth: input.dateOfBirth ?? null,
    p_birth_year: null,
    p_address: null,
    p_city: null,
    p_province: null,
    p_postal_code: null,
    p_actor_id: input.actorId,
    p_actor_email: input.actorEmail,
  });
  if (error) throw error;
  const row = (data ?? {}) as { customer_id?: string; fields?: string[]; audit_id?: number };
  return {
    customerId: row.customer_id ?? input.customerId,
    fields: Array.isArray(row.fields) ? row.fields : [],
    auditId: row.audit_id ?? null,
  };
}
