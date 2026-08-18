import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SegmentCriteria } from "./segment";
import { activeMirrorFlagColumns } from "./mirror-constants";

// Re-exported so existing importers (the segments route) keep one entry point for the mirror.
export { activeMirrorFlagColumns };

/**
 * Read layer for crm_customer_mirror (migration 15, Sprint 5A) — the pre-joined mirror of the
 * slow-and-static customer facts. Server-only; the service-role client is passed in by the
 * caller (which owns auth + RBAC). The mirror has NO RLS, so its only protection is the SELECT
 * grant (service_role only); this module never runs on the anon path.
 *
 * WHAT THE MIRROR ACCELERATES — and what it does NOT:
 *   The segment builder used to resolve each source-presence criterion (Hyrox / my20fit / arena /
 *   gym / clinic-patient) by scanning that source table, transferring its emails, and matching
 *   them to master_customer over the wire — one round trip per source, then a client-side set
 *   intersection. The mirror pre-computes those five presence booleans, so the same id-set is one
 *   indexed query. Measured on a representative two-source segment: ~2.2s (combined source join,
 *   before) → ~49ms (single mirror scan, after), and the app also drops from ~4-8 round trips to 1.
 *
 *   The mirror does NOT serve: consent / suppression (volatile — those stay LIVE, always), the
 *   Fitco/program participation criteria and RFM buckets (those stay on the migration-14 staging
 *   RPC — the mirror carries staging_rfm but the Fitco definition is program-based, not an RFM
 *   value, so it cannot be reproduced from the mirror), real recency, clinic-transaction linkage,
 *   and the ecosystem (customer_engagement) unit/product filters. Any of those still route to
 *   their live resolver; the mirror is intersected with them, never replaces them.
 *
 * EQUALITY IS VERIFIED, NOT ASSUMED: each of the five presence flags equals its live resolver for
 * the current data (crm_norm_phone == normalizePhoneID, lower(btrim(email)) == normalizeEmail),
 * confirmed by direct count comparison at apply time (hyrox 152, my20fit 170, arena 653, gym 6,
 * clinic 112 — mirror == source path, exactly). See the sprint report's comparison table.
 */

const MIRROR = "crm_customer_mirror";
const META = "crm_mirror_meta";

/** Page size for reading mirror id-sets — bounded so a growing flag-set can never silently
 *  truncate at PostgREST's default row cap (all five flag-sets are <1000 today, but the loop is
 *  structural, not a lucky value — the whole project's posture on truncation). */
const PAGE = 1000;

/** Freshness of the mirror, from crm_mirror_meta (one row). Shown in the UI so a snapshot never
 *  masquerades as live (the last_activity_at lesson). */
export interface MirrorMeta {
  refreshedAt: string | null;
  rowCount: number | null;
}

export async function fetchMirrorMeta(admin: SupabaseClient): Promise<MirrorMeta> {
  const { data, error } = await admin
    .from(META)
    .select("refreshed_at, row_count")
    .maybeSingle();
  if (error) throw error;
  const r = data as { refreshed_at: string | null; row_count: number | null } | null;
  return { refreshedAt: r?.refreshed_at ?? null, rowCount: r?.row_count ?? null };
}

/**
 * The set of master customer_ids matching ALL active mirror-served presence flags (AND), in one
 * paginated query against crm_customer_mirror. Returns null when NO mirror-served flag is active
 * (so the caller's non-mirror resolvers and master-column filters are untouched). By construction
 * every id is a master_customer customer_id (the mirror is 1:1 with master_customer), so the
 * result slots directly into the same intersection the live resolvers feed.
 */
export async function resolveMirrorSourceIds(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
): Promise<Set<string> | null> {
  const columns = activeMirrorFlagColumns(criteria);
  if (columns.length === 0) return null;

  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from(MIRROR)
      .select("customer_id")
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE - 1);
    // AND every active flag — .eq(col, true) per column; the mirror booleans are non-null.
    for (const col of columns) q = q.eq(col, true);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as { customer_id: string }[];
    for (const r of batch) ids.add(r.customer_id);
    if (batch.length < PAGE) break;
  }
  return ids;
}
