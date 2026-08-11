import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskPhone, maskEmail } from "./mask";
import {
  SEGMENT_NULL,
  AUDIENCE_MAX_PAGE_SIZE,
  AUDIENCE_DEFAULT_PAGE_SIZE,
} from "./audience-constants";

// Re-export so existing server-side importers (route handler) keep a single source.
export { SEGMENT_NULL, AUDIENCE_MAX_PAGE_SIZE, AUDIENCE_DEFAULT_PAGE_SIZE };

/**
 * Audience pool — READ-ONLY read layer over the EXISTING master_customer table
 * (82,253 rows). Sprint 3A: evaluation, not operations.
 *
 * Hard rules encoded here (PRD 17.1):
 *   - This module's reads run through the service-role admin client, server-side, and it is
 *     `server-only` + takes the admin client as a parameter (the caller, a route handler,
 *     owns auth + role checks). NOTE (Sprint 3Q, T-17): this is NOT the only path to
 *     master_customer — the table has a permissive `authenticated_full_access` policy
 *     (ALL/USING true), so any of 887 login accounts can read/write it directly via
 *     PostgREST, bypassing this module, its masking, and its audit. Masking + RBAC here
 *     protect the APP path only; the DB does not enforce read-only. See
 *     docs/ESKALASI-paparan-data-sensitif.md and K-23.
 *   - Masking is applied HERE, server-side, before rows are returned. A masked caller
 *     never receives the real phone/email — on the app path.
 *   - NO write path. NO export. This module only SELECTs.
 *
 * It deliberately does NOT read `master_customer` into any crm_* table — ingestion is
 * still blocked. It reads the source in place.
 */

/** Columns surfaced to the UI (PRD-approved list). `last_activity_at` is deliberately
 *  absent: it is an import artifact (99.62% equals first_seen_at) and must not be shown
 *  as "last active". */
export const AUDIENCE_COLUMNS = [
  "full_name",
  "phone_normalized",
  "email_normalized",
  "city",
  "first_unit",
  "segment",
  "lifetime_value",
  "created_at",
] as const;

export type RevenueFilter = "all" | "has" | "none";

export interface AudienceFilters {
  unit?: string | null; // first_unit exact match
  segment?: string | null; // exact match, or SEGMENT_NULL for the NULL cohort
  city?: string | null; // case-insensitive contains
  revenue?: RevenueFilter; // has (>0) / none (0 or null) / all
}

export interface AudienceQuery extends AudienceFilters {
  page: number; // 1-based
  pageSize: number;
}

/** A row as returned to the client. phone/email are already masked when `masked`. */
export interface AudienceRow {
  /**
   * REVERSED in Sprint 3C: customer_id IS now returned. It was previously withheld
   * ("never selected, never returned"), but that rule was about DISPLAY columns. The
   * profile-detail screen needs an opaque handle to open one row, and a role that may
   * see the list may open a row from it. customer_id is a UUID — opaque to the user,
   * not contact PII — used only as the route key for /api/audience/[id]. It is NOT a
   * display column: the UI uses it for the link target, never as a shown value.
   */
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  created_at: string | null;
}

export interface AudienceResult {
  rows: AudienceRow[];
  total: number; // total rows matching the filters (not just this page)
  page: number;
  pageSize: number;
  masked: boolean;
}

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

/** Clamp an incoming page size into [1, AUDIENCE_MAX_PAGE_SIZE]. */
export function clampPageSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return AUDIENCE_DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), AUDIENCE_MAX_PAGE_SIZE);
}

/**
 * Run the audience query. `admin` MUST be the service-role client. `masked` decides
 * server-side masking of phone/email. Ordering is stable (created_at desc, then
 * customer_id) so pagination does not shuffle rows between pages.
 */
export async function fetchAudience(
  admin: SupabaseClient,
  query: AudienceQuery,
  masked: boolean,
): Promise<AudienceResult> {
  const page = query.page >= 1 ? Math.floor(query.page) : 1;
  const pageSize = clampPageSize(query.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = admin
    .from("master_customer")
    // customer_id is selected as the row's opaque handle for the detail link (see the
    // AudienceRow.customer_id note) — it is not one of the display columns.
    .select(["customer_id", ...AUDIENCE_COLUMNS].join(","), { count: "exact" });

  if (query.unit) q = q.eq("first_unit", query.unit);

  if (query.segment === SEGMENT_NULL) q = q.is("segment", null);
  else if (query.segment) q = q.eq("segment", query.segment);

  if (query.city) q = q.ilike("city", `%${query.city}%`);

  if (query.revenue === "has") q = q.gt("lifetime_value", 0);
  else if (query.revenue === "none") q = q.or("lifetime_value.is.null,lifetime_value.eq.0");

  // Stable order for pagination (created_at desc, then customer_id as a tiebreaker).
  q = q
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("customer_id", { ascending: true })
    .range(from, to);

  const { data, count, error } = await q;
  if (error) throw error;

  const raw = (data ?? []) as unknown as RawRow[];
  const rows: AudienceRow[] = raw.map((r) => ({
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

  return { rows, total: count ?? 0, page, pageSize, masked };
}

// ── PROFILE DETAIL ────────────────────────────────────────────────────────────────

/** One profile as returned by the detail endpoint. phone/email masked when `masked`.
 *  `last_activity_at` is deliberately absent (import artifact — rule unchanged since 3A). */
export interface ProfileDetail {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  source: string | null;
  first_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_potential_duplicate: boolean | null;
  duplicate_reason: string | null;
  is_merged: boolean | null;
  notes: string | null;
  tags: string[] | null;
  masked: boolean;
}

const PROFILE_COLUMNS = [
  "customer_id",
  "full_name",
  "phone_normalized",
  "email_normalized",
  "city",
  "first_unit",
  "segment",
  "lifetime_value",
  "source",
  "first_seen_at",
  "created_at",
  "updated_at",
  "is_potential_duplicate",
  "duplicate_reason",
  "is_merged",
  "notes",
  "tags",
].join(",");

/** A well-formed UUID. Anything else can't be a customer_id, so callers return 404
 *  without touching the database (and without leaking that the check even ran). */
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Fetch one profile by customer_id. Returns null when there is no such row (caller
 * turns that into a 404 — never a distinct "exists but hidden" message, so this can't
 * be used to enumerate). Masking is applied here, server-side.
 */
export async function fetchProfileById(
  admin: SupabaseClient,
  id: string,
  masked: boolean,
): Promise<ProfileDetail | null> {
  const { data, error } = await admin
    .from("master_customer")
    .select(PROFILE_COLUMNS)
    .eq("customer_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const r = data as unknown as {
    customer_id: string;
    full_name: string | null;
    phone_normalized: string | null;
    email_normalized: string | null;
    city: string | null;
    first_unit: string | null;
    segment: string | null;
    lifetime_value: number | null;
    source: string | null;
    first_seen_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    is_potential_duplicate: boolean | null;
    duplicate_reason: string | null;
    is_merged: boolean | null;
    notes: string | null;
    tags: string[] | null;
  };

  return {
    customer_id: r.customer_id,
    full_name: r.full_name,
    phone: masked ? maskPhone(r.phone_normalized) : r.phone_normalized,
    email: masked ? maskEmail(r.email_normalized) : r.email_normalized,
    city: r.city,
    first_unit: r.first_unit,
    segment: r.segment,
    lifetime_value: r.lifetime_value,
    source: r.source,
    first_seen_at: r.first_seen_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_potential_duplicate: r.is_potential_duplicate,
    duplicate_reason: r.duplicate_reason,
    is_merged: r.is_merged,
    notes: r.notes,
    tags: r.tags,
    masked,
  };
}
