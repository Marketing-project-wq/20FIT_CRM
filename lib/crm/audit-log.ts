import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
} from "./audit-log-constants";

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
}

export interface AuditLogResult {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function clampAuditPageSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return AUDIT_DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), AUDIT_MAX_PAGE_SIZE);
}

/** Escape PostgREST like/ilike wildcards so a user filter can't inject a pattern. */
function escapeLike(s: string): string {
  return s.replace(/[%_,]/g, (m) => `\\${m}`);
}

export async function fetchAuditLog(
  admin: SupabaseClient,
  query: AuditLogQuery,
): Promise<AuditLogResult> {
  const page = query.page >= 1 ? Math.floor(query.page) : 1;
  const pageSize = clampAuditPageSize(query.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = admin
    .from("crm_audit_log")
    .select("id, occurred_at, actor_email, action, target_table, target_id, summary, metadata", {
      count: "exact",
    });

  if (query.action) q = q.ilike("action", `${escapeLike(query.action)}%`);
  if (query.actorEmail) q = q.ilike("actor_email", `%${escapeLike(query.actorEmail)}%`);
  if (query.dateFrom) q = q.gte("occurred_at", query.dateFrom);
  if (query.dateTo) q = q.lte("occurred_at", query.dateTo);

  q = q
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, to);

  const { data, count, error } = await q;
  if (error) throw error;

  return {
    rows: (data ?? []) as AuditLogRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
