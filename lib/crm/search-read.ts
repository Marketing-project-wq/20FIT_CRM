import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskPhone, maskEmail } from "./mask";
import {
  classifyResultCount,
  SEARCH_MAX_RESULTS,
  type PreparedSearch,
  type ResultStatus,
} from "./search";

/**
 * Profile SEARCH read layer — READ-ONLY over master_customer, server-only, service-role
 * client passed in by the route (which owns auth + the profile.view_list gate). Masking is
 * applied HERE, exactly like lib/crm/audience.ts — a masked caller never receives the real
 * phone/email. This module SELECTs only; no write, no export.
 *
 * Query shape follows the indexes (see lib/crm/search.ts):
 *   - name  → ilike %term%  (GIN trigram)     — substring
 *   - phone → eq phone_normalized (btree UNIQUE) — equality
 *   - email → eq email_normalized (btree UNIQUE) — equality
 *
 * It fetches `cap + 1` rows so "more than the cap" is detected without a second count.
 */

export interface SearchHit {
  customer_id: string;
  full_name: string | null;
  phone: string | null; // masked when `masked`
  email: string | null; // masked when `masked`
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  created_at: string | null;
}

export type SearchOutcome =
  | { status: "empty" }
  | { status: "too_many"; cap: number }
  | { status: "ok"; rows: SearchHit[]; count: number };

interface RawRow {
  customer_id: string;
  full_name: string | null;
  phone_normalized: string | null;
  email_normalized: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  created_at: string | null;
}

const SEARCH_COLUMNS =
  "customer_id, full_name, phone_normalized, email_normalized, city, first_unit, segment, lifetime_value, created_at";

/** Escape PostgREST like wildcards so a name term can't inject a pattern (defense in
 *  depth — prepareSearch already rejects % and _ on name). */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Run a prepared search. Returns a discriminated outcome; the route decides HTTP shape and
 * writes the audit row. `masked` decides server-side masking of phone/email.
 */
export async function runProfileSearch(
  admin: SupabaseClient,
  prepared: Extract<PreparedSearch, { ok: true }>,
  masked: boolean,
): Promise<SearchOutcome> {
  const cap = SEARCH_MAX_RESULTS;

  let q = admin.from("master_customer").select(SEARCH_COLUMNS);
  if (prepared.kind === "name") {
    q = q.ilike("full_name", `%${escapeLike(prepared.term)}%`);
  } else if (prepared.kind === "phone") {
    q = q.eq("phone_normalized", prepared.term);
  } else {
    q = q.eq("email_normalized", prepared.term);
  }
  // Stable order + probe one past the cap to detect "too many".
  q = q.order("full_name", { ascending: true, nullsFirst: false }).limit(cap + 1);

  const { data, error } = await q;
  if (error) throw error;

  const raw = (data ?? []) as unknown as RawRow[];
  const status: ResultStatus = classifyResultCount(raw.length, cap);

  if (status === "empty") return { status: "empty" };
  if (status === "too_many") return { status: "too_many", cap };

  const rows: SearchHit[] = raw.map((r) => ({
    customer_id: r.customer_id,
    full_name: r.full_name,
    phone: masked ? maskPhone(r.phone_normalized) : r.phone_normalized,
    email: masked ? maskEmail(r.email_normalized) : r.email_normalized,
    city: r.city,
    first_unit: r.first_unit,
    segment: r.segment,
    lifetime_value: r.lifetime_value,
    created_at: r.created_at,
  }));
  return { status: "ok", rows, count: rows.length };
}
