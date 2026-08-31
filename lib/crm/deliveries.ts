import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deliveries read layer — the "Kiriman" tab under Campaigns. Scheduled, running, done and stopped are
 * ONE thing at different stages, not three menus, so this merges the two sources into a single
 * chronological list:
 *   - crm_scheduled_send  → the future (AKAN DATANG): pending rows the pg_cron executor will pick up.
 *   - crm_campaign_run    → the past/present: a run owned by a segment (manual campaign) OR a workflow
 *                           (automated), with its per-recipient log under crm_message_log.
 *
 * A scheduled row that has already run ('sent') is NOT listed here — its crm_campaign_run represents
 * it, and showing both would double-count the same send. Cancelled/failed scheduled rows ARE shown
 * (they never became a run).
 *
 * Every row is traceable to its run (fix #2): a run row carries runId, so the per-recipient detail
 * (deliveryRecipients) can be opened for it. The owner (segment or workflow) is resolved to a NAME,
 * and each row is tagged manual vs auto (fix: workflow and human-composed sends read differently when
 * tracing a problem).
 */

export type DeliveryState = "upcoming" | "running" | "done" | "stopped" | "cancelled";
export type DeliverySource = "manual" | "auto";

export interface DeliveryRow {
  kind: "scheduled" | "run";
  id: string; // scheduled_send.id (upcoming) or campaign_run.id (run)
  runId: string | null; // present for runs → opens per-recipient detail; null for a not-yet-run schedule
  label: string | null; // human run label
  ownerName: string | null; // segment name (manual) or workflow name (auto); null if unresolved
  source: DeliverySource;
  templateKey: string;
  recipientCount: number; // shown_sendable for a schedule; logged rows for a run
  state: DeliveryState;
  time: string; // UTC ISO — scheduled_at for upcoming, created_at for a run
  cancellable: boolean; // only a pending scheduled send
  lastError: string | null;
}

interface ScheduledRow {
  id: string;
  segment_id: string;
  template_key: string;
  run_label: string | null;
  scheduled_at: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  shown_sendable: number | null;
  last_error: string | null;
}

interface RunRow {
  id: string;
  segment_id: string | null;
  workflow_id: string | null;
  template_key: string;
  label: string | null;
  status: "draft" | "sending" | "sent" | "stopped";
  created_at: string;
  last_error: string | null;
}

const RUN_STATE: Record<RunRow["status"], DeliveryState> = {
  draft: "running",
  sending: "running",
  sent: "done",
  stopped: "stopped",
};

/** Resolve a set of segment ids → names, and workflow ids → names, each in one query. */
async function resolveOwnerNames(
  admin: SupabaseClient,
  segmentIds: string[],
  workflowIds: string[],
): Promise<{ segments: Map<string, string>; workflows: Map<string, string> }> {
  const segments = new Map<string, string>();
  const workflows = new Map<string, string>();
  const [segRes, wfRes] = await Promise.all([
    segmentIds.length
      ? admin.from("crm_segment").select("id, name").in("id", segmentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    workflowIds.length
      ? admin.from("crm_workflow").select("id, name").in("id", workflowIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  for (const s of (segRes.data ?? []) as { id: string; name: string }[]) segments.set(s.id, s.name);
  for (const w of (wfRes.data ?? []) as { id: string; name: string }[]) workflows.set(w.id, w.name);
  return { segments, workflows };
}

/** Count logged recipients per run (crm_message_log.campaign_id = run.id) — one head-count per run. */
async function countRecipients(admin: SupabaseClient, runIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await Promise.all(
    runIds.map(async (id) => {
      const { count } = await admin
        .from("crm_message_log")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id);
      counts.set(id, count ?? 0);
    }),
  );
  return counts;
}

export async function listDeliveries(admin: SupabaseClient, limit = 100): Promise<DeliveryRow[]> {
  const [schedRes, runRes] = await Promise.all([
    admin
      .from("crm_scheduled_send")
      .select("id, segment_id, template_key, run_label, scheduled_at, status, shown_sendable, last_error")
      .neq("status", "sent") // a 'sent' schedule is represented by its run — don't double-count
      .order("scheduled_at", { ascending: false }),
    admin
      .from("crm_campaign_run")
      .select("id, segment_id, workflow_id, template_key, label, status, created_at, last_error")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const scheduled = (schedRes.data ?? []) as ScheduledRow[];
  const runs = (runRes.data ?? []) as RunRow[];

  const segmentIds = new Set<string>();
  const workflowIds = new Set<string>();
  for (const s of scheduled) segmentIds.add(s.segment_id);
  for (const r of runs) {
    if (r.segment_id) segmentIds.add(r.segment_id);
    if (r.workflow_id) workflowIds.add(r.workflow_id);
  }

  const [{ segments, workflows }, counts] = await Promise.all([
    resolveOwnerNames(admin, Array.from(segmentIds), Array.from(workflowIds)),
    countRecipients(admin, runs.map((r) => r.id)),
  ]);

  const rows: DeliveryRow[] = [];

  for (const s of scheduled) {
    const state: DeliveryState =
      s.status === "pending" ? "upcoming" : s.status === "cancelled" ? "cancelled" : "stopped";
    rows.push({
      kind: "scheduled",
      id: s.id,
      runId: null,
      label: s.run_label,
      ownerName: segments.get(s.segment_id) ?? null,
      source: "manual",
      templateKey: s.template_key,
      recipientCount: s.shown_sendable ?? 0,
      state,
      time: s.scheduled_at,
      cancellable: s.status === "pending",
      lastError: s.last_error,
    });
  }

  for (const r of runs) {
    const source: DeliverySource = r.workflow_id ? "auto" : "manual";
    const ownerName = r.workflow_id
      ? workflows.get(r.workflow_id) ?? null
      : r.segment_id
        ? segments.get(r.segment_id) ?? null
        : null;
    rows.push({
      kind: "run",
      id: r.id,
      runId: r.id,
      label: r.label,
      ownerName,
      source,
      templateKey: r.template_key,
      recipientCount: counts.get(r.id) ?? 0,
      state: RUN_STATE[r.status],
      time: r.created_at,
      cancellable: false,
      lastError: r.last_error,
    });
  }

  // One timeline, newest first: upcoming (future) naturally sorts above past runs by time.
  rows.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
  return rows;
}

export interface DeliveryRecipient {
  name: string | null; // master_customer.full_name; null → shown as "unresolved", never a uuid fragment
  channel: string;
  status: string;
  failureCause: string | null;
  createdAt: string;
}

/**
 * Per-recipient detail for one run (crm_message_log.campaign_id = runId). Resolves the customer NAME
 * (fix #1: never a uuid fragment) — contact stays out entirely (it is only stored as a keyed hash,
 * same as the old history panel, so this is not a back-door around contact masking). An unresolved id
 * is shown as such, not as a truncated id.
 */
export async function deliveryRecipients(
  admin: SupabaseClient,
  runId: string,
  limit = 500,
): Promise<DeliveryRecipient[]> {
  const { data, error } = await admin
    .from("crm_message_log")
    .select("customer_id, channel, status, failure_cause, created_at")
    .eq("campaign_id", runId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const logs = data as {
    customer_id: string;
    channel: string;
    status: string;
    failure_cause: string | null;
    created_at: string;
  }[];

  const ids = Array.from(new Set(logs.map((l) => l.customer_id)));
  const names = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: profs } = await admin.from("master_customer").select("customer_id, full_name").in("customer_id", chunk);
    for (const p of (profs ?? []) as { customer_id: string; full_name: string | null }[]) {
      names.set(p.customer_id, p.full_name);
    }
  }

  return logs.map((l) => ({
    name: names.get(l.customer_id) ?? null,
    channel: l.channel,
    status: l.status,
    failureCause: l.failure_cause,
    createdAt: l.created_at,
  }));
}
