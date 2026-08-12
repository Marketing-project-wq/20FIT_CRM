import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizePhoneID } from "./normalize";
import {
  MULTISOURCE_DEFS,
  phoneMatchCandidates,
  type MatchKey,
  type MultiSourceDef,
} from "./multisource-constants";

/**
 * Multi-source profile completion (TUGAS 3) — READ-ONLY, server-only, service-role client
 * passed in by the route. Matches a profile to the arena/gym booking sources by NORMALISED
 * EMAIL first, then NORMALISED PHONE (K-06) — never by name. The matched key is recorded so
 * the confidence shows on screen.
 *
 * ZERO write to master_customer / crm_*. The profile's real email + phone are read server-side
 * ONLY (by customer_id) to compute the match; they never leave this layer. Only the per-source
 * safeColumns are selected (guarded by multisource.test.ts). Rows are capped for display.
 *
 * The clinic_* chain (patient_id, health data behind profile.view_health), /quality coverage,
 * and segment filters are NOT here — see docs/RENCANA-multisumber.md.
 */

const ROW_CAP = 20; // per source; a profile view is not an export

export interface MultiSourceRow {
  label: string | null; // the labelColumn value (e.g. a booking code)
  status: string | null;
  extra: Record<string, unknown>; // remaining safe columns, for the UI to render as it likes
}

export interface MultiSourceResult {
  key: string;
  label: string;
  matched: boolean;
  /** Which identity produced the match — shown as a confidence cue. null when unmatched. */
  keyUsed: MatchKey | null;
  count: number;
  rows: MultiSourceRow[];
}

export interface ProfileMultiSource {
  /** false when the profile has neither email nor phone to match on. */
  matchable: boolean;
  sources: MultiSourceResult[];
}

/** Case-insensitive exact email match (no wildcards in the value). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectByEmail(admin: SupabaseClient, def: MultiSourceDef, email: string): any {
  return admin
    .from(def.table)
    .select(def.safeColumns.join(","))
    .ilike(def.emailColumn, email)
    .limit(ROW_CAP);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectByPhone(admin: SupabaseClient, def: MultiSourceDef, candidates: string[]): any {
  return admin
    .from(def.table)
    .select(def.safeColumns.join(","))
    .in(def.phoneColumn as string, candidates)
    .limit(ROW_CAP);
}

function toRows(def: MultiSourceDef, data: Record<string, unknown>[]): MultiSourceRow[] {
  return data.map((r) => {
    const extra: Record<string, unknown> = {};
    for (const col of def.safeColumns) {
      if (col === def.labelColumn || col === def.statusColumn) continue;
      extra[col] = r[col];
    }
    return {
      label: (r[def.labelColumn] as string | null) ?? null,
      status: def.statusColumn ? ((r[def.statusColumn] as string | null) ?? null) : null,
      extra,
    };
  });
}

export async function fetchProfileMultiSource(
  admin: SupabaseClient,
  customerId: string,
): Promise<ProfileMultiSource> {
  // Real identity, server-side only — never returned to the client.
  const { data: prof, error: profErr } = await admin
    .from("master_customer")
    .select("email_normalized, phone_normalized")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (profErr) throw profErr;

  const p = prof as { email_normalized: string | null; phone_normalized: string | null } | null;
  const email = normalizeEmail(p?.email_normalized ?? null);
  const phone = normalizePhoneID(p?.phone_normalized ?? null);

  if (!email && !phone) {
    return { matchable: false, sources: [] };
  }

  const phoneCandidates = phone ? phoneMatchCandidates(phone) : [];

  const sources: MultiSourceResult[] = [];
  for (const def of MULTISOURCE_DEFS) {
    let matchKey: MatchKey | null = null;
    let data: Record<string, unknown>[] = [];

    // Email first.
    if (email) {
      const { data: d, error } = await selectByEmail(admin, def, email);
      if (error) throw error;
      if ((d ?? []).length > 0) {
        data = d as Record<string, unknown>[];
        matchKey = "email";
      }
    }
    // Phone fallback — only if email did not match and the source + profile have a phone.
    if (!matchKey && def.phoneColumn && phoneCandidates.length > 0) {
      const { data: d, error } = await selectByPhone(admin, def, phoneCandidates);
      if (error) throw error;
      if ((d ?? []).length > 0) {
        data = d as Record<string, unknown>[];
        matchKey = "phone";
      }
    }

    sources.push({
      key: def.key,
      label: def.label,
      matched: matchKey !== null,
      keyUsed: matchKey,
      count: data.length,
      rows: toRows(def, data),
    });
  }

  return { matchable: true, sources };
}
