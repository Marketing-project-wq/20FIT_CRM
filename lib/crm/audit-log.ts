import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
} from "./audit-log-constants";
import { COMPLIANCE_OR, OPERATIONAL_OR } from "./retention-policy";
import { summarizeAuditGap, type AuditGapSummary } from "./audit-gap";

/**
 * Audit-log read layer — READ-ONLY over crm_audit_log. Server-only; the service-role
 * client is passed in by the route handler (which owns auth + the audit.view gate).
 *
 * crm_audit_log has RLS ON with zero policy AND an append-only trigger, so there is no
 * write/delete path to expose and none is offered. This module only SELECTs.
 *
 * metadata is returned as-is. It was designed PII-free and that was VERIFIED against
 * every existing row on 2026-08-11 (only aggregate context + filter values, no customer
 * identity). If a future writer ever puts customer identity in metadata, that is a bug
 * at the WRITE site — this reader must not become the place that silently hides it.
 */

export interface AuditLogRow {
  id: number;
  occurred_at: string | null;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: unknown;
}

/** Which retention class to restrict the list to. Default view is compliance-first. */
export type AuditCategory = "compliance" | "operational" | "all";

export interface AuditLogQuery {
  page: number;
  pageSize: number;
  /** Exact action or a prefix like `role.` — matched as a prefix. */
  action?: string | null;
  /** Substring match on actor_email. */
  actorEmail?: string | null;
  /** ISO date (inclusive) lower/upper bound on occurred_at. */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Restrict to a retention class. Default is 'compliance' at the UI (see route). */
  category?: AuditCategory;
}

/** Counts by retention class over the current range (action/actor/date filters,
 *  IGNORING category + pagination) — this is the ratio the screen surfaces. */
export interface AuditCounts {
  compliance: number;
  operational: number;
  other: number;
  total: number;
}

export interface AuditLogResult {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  category: AuditCategory;
  counts: AuditCounts;
  /** Id-sequence gap over the WHOLE log (not the filtered page). A hole = a failed
   *  audited operation whose row never landed. See lib/crm/audit-gap.ts. */
  gap: AuditGapSummary;
}

// PostgREST `.or()` patterns are DERIVED from the single retention-policy source —
// never retyped, so the category filter can never disagree with classifyAction.

export function clampAuditPageSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return AUDIT_DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), AUDIT_MAX_PAGE_SIZE);
}

/** Escape PostgREST like/ilike wildcards so a user filter can't inject a pattern. */
function escapeLike(s: string): string {
  return s.replace(/[%_,]/g, (m) => `\\${m}`);
}

/** Apply the range filters (action / actor / date) shared by the list and the counts.
 *  The Supabase filter builder is awkward to type generically, so `any` here mirrors
 *  the existing pattern in quality.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRangeFilters(q: any, query: AuditLogQuery): any {
  let out = q;
  if (query.action) out = out.ilike("action", `${escapeLike(query.action)}%`);
  if (query.actorEmail) out = out.ilike("actor_email", `%${escapeLike(query.actorEmail)}%`);
  if (query.dateFrom) out = out.gte("occurred_at", query.dateFrom);
  if (query.dateTo) out = out.lte("occurred_at", query.dateTo);
  return out;
}

async function countWith(
  admin: SupabaseClient,
  query: AuditLogQuery,
  orPattern: string | null,
): Promise<number> {
  let q = admin.from("crm_audit_log").select("id", { count: "exact", head: true });
  q = applyRangeFilters(q, query);
  if (orPattern) q = q.or(orPattern);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchAuditLog(
  admin: SupabaseClient,
  query: AuditLogQuery,
): Promise<AuditLogResult> {
  const page = query.page >= 1 ? Math.floor(query.page) : 1;
  const pageSize = clampAuditPageSize(query.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const category: AuditCategory = query.category ?? "all";

  let q = admin
    .from("crm_audit_log")
    .select("id, occurred_at, actor_email, action, target_table, target_id, summary, metadata", {
      count: "exact",
    });

  q = applyRangeFilters(q, query);
  if (category === "compliance") q = q.or(COMPLIANCE_OR);
  else if (category === "operational") q = q.or(OPERATIONAL_OR);

  q = q
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, to);

  // Ratio over the SAME range (ignoring category): compliance vs operational vs other.
  // Gap is over the WHOLE log (unfiltered) — min id, max id, total rows.
  const [listRes, compliance, operational, total, gapAgg] = await Promise.all([
    q,
    countWith(admin, query, COMPLIANCE_OR),
    countWith(admin, query, OPERATIONAL_OR),
    countWith(admin, query, null),
    fetchGapAggregates(admin),
  ]);
  if (listRes.error) throw listRes.error;

  return {
    rows: (listRes.data ?? []) as AuditLogRow[],
    total: listRes.count ?? 0,
    page,
    pageSize,
    category,
    counts: { compliance, operational, other: total - compliance - operational, total },
    gap: summarizeAuditGap(gapAgg.minId, gapAgg.maxId, gapAgg.count),
  };
}

/** Whole-log min id / max id / row count — three cheap reads, no filters. Feeds the gap
 *  summary. Unfiltered on purpose: a filtered id range's holes are mostly filter
 *  exclusions, not failures. */
async function fetchGapAggregates(
  admin: SupabaseClient,
): Promise<{ minId: number | null; maxId: number | null; count: number }> {
  const [minRes, maxRes, countRes] = await Promise.all([
    admin.from("crm_audit_log").select("id").order("id", { ascending: true }).limit(1).maybeSingle(),
    admin.from("crm_audit_log").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.from("crm_audit_log").select("id", { count: "exact", head: true }),
  ]);
  if (minRes.error) throw minRes.error;
  if (maxRes.error) throw maxRes.error;
  if (countRes.error) throw countRes.error;
  const minId = (minRes.data as { id: number } | null)?.id ?? null;
  const maxId = (maxRes.data as { id: number } | null)?.id ?? null;
  return { minId, maxId, count: countRes.count ?? 0 };
}
