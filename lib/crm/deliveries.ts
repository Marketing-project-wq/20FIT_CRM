import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmailDocument } from "./email-document";
import type { RunStatus } from "./campaign-run-status";

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

export type DeliveryState =
  | "upcoming"
  | "overdue"
  | "running"
  | "done"
  | "partial"
  | "failed"
  | "stopped"
  | "cancelled";
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
  /** Log rows that FAILED for this run (status 'failed'). Shown on the row whenever it is > 0 — a
   *  run whose recipients mostly failed must not read as a clean send. Counted for EVERY run, at
   *  EVERY status, and that is load-bearing in three ways:
   *    - 'sent' — runs finished before partial/failed existed still carry their failures (the 3 Sep
   *      run is filed 'sent' with 18,119 of them and is deliberately not back-filled);
   *    - 'sending' — a run still working through the daily ceiling keeps its status even when some
   *      recipients failed (T-46: deferral outranks failure, so the run stays resumable). The
   *      failures must not vanish from the screen just because the status is not 'partial';
   *    - 'stopped' — a halted run's failure count is the size of what it halted on.
   *  0 for a scheduled row that never became a run. */
  failedCount: number;
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
  status: RunStatus;
  created_at: string;
  last_error: string | null;
}

const RUN_STATE: Record<RunStatus, DeliveryState> = {
  draft: "running",
  sending: "running",
  sent: "done",
  partial: "partial",
  failed: "failed",
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

interface RunCounts {
  logged: number;
  failed: number;
}

/** Logged + FAILED recipients per run (crm_message_log.campaign_id = run.id) — two head-counts per
 *  run, no row read. The failed count is not derived from the run's status: a run can carry failures
 *  whatever its status says, and that discrepancy is exactly what the list must show. */
async function countRecipients(admin: SupabaseClient, runIds: string[]): Promise<Map<string, RunCounts>> {
  const counts = new Map<string, RunCounts>();
  await Promise.all(
    runIds.map(async (id) => {
      const [{ count: logged }, { count: failed }] = await Promise.all([
        admin.from("crm_message_log").select("id", { count: "exact", head: true }).eq("campaign_id", id),
        admin
          .from("crm_message_log")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", id)
          .eq("status", "failed"),
      ]);
      counts.set(id, { logged: logged ?? 0, failed: failed ?? 0 });
    }),
  );
  return counts;
}

export async function listDeliveries(admin: SupabaseClient, limit = 100, nowIso = new Date().toISOString()): Promise<DeliveryRow[]> {
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
    // A pending row whose time has passed but which never ran is OVERDUE — shown distinctly from
    // upcoming, so an executor that silently stopped firing (the T-40 #8 failure) is visible on the
    // screen rather than hiding as a normal "AKAN DATANG".
    const state: DeliveryState =
      s.status === "pending"
        ? s.scheduled_at < nowIso
          ? "overdue"
          : "upcoming"
        : s.status === "cancelled"
          ? "cancelled"
          : "stopped";
    rows.push({
      kind: "scheduled",
      id: s.id,
      runId: null,
      label: s.run_label,
      ownerName: segments.get(s.segment_id) ?? null,
      source: "manual",
      templateKey: s.template_key,
      recipientCount: s.shown_sendable ?? 0,
      failedCount: 0, // a scheduled row has no log rows yet; its run will carry them
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
      recipientCount: counts.get(r.id)?.logged ?? 0,
      failedCount: counts.get(r.id)?.failed ?? 0,
      state: RUN_STATE[r.status] ?? "running",
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

export interface DeliveryDetail {
  // Summary
  runId: string;
  label: string | null;
  ownerName: string | null;
  source: DeliverySource;
  templateKey: string;
  templateVersion: number | null; // the version RECORDED on the log rows — what recipients received
  status: string;
  createdAt: string;
  createdBy: string | null;
  lastError: string | null;
  // Audience (the four numbers computed at send time, from the run's audit row)
  audience: { matched: number; hasEmail: number; skippedSuppression: number; sent: number } | null;
  // Result report (from crm_message_log timestamps — what the Mailtrap webhook has filled)
  result: {
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
    failed: number;
  };
  // Preview of the EXACT version sent (skeleton-wrapped). null if that version can't be found.
  preview: { subject: string | null; html: string } | null;
  // Opens/clicks are NOT measured: the Mailtrap webhook does not subscribe Open/Click events, so
  // opened_at/clicked_at are always null. We surface this as "not measured" rather than a fake 0.
  engagementMeasured: boolean;
  recipients: DeliveryRecipient[];
}

/**
 * The full picture of one delivery (run): summary, the four audience numbers, the result report, a
 * preview of the exact template VERSION that was sent (not the latest — that is the whole point of
 * recording the version), and the per-recipient list. Opens/clicks are deliberately reported as
 * "not measured": the webhook doesn't subscribe those events, so their columns are always null and
 * showing a 0 would look measured when it is not.
 */
export async function deliveryDetail(admin: SupabaseClient, runId: string): Promise<DeliveryDetail | null> {
  const { data: runData } = await admin
    .from("crm_campaign_run")
    .select("id, segment_id, workflow_id, template_key, label, status, created_at, created_by, last_error")
    .eq("id", runId)
    .maybeSingle();
  if (!runData) return null;
  const run = runData as {
    id: string; segment_id: string | null; workflow_id: string | null; template_key: string;
    label: string | null; status: string; created_at: string; created_by: string | null; last_error: string | null;
  };

  const source: DeliverySource = run.workflow_id ? "auto" : "manual";
  const ownerName = run.workflow_id
    ? (await admin.from("crm_workflow").select("name").eq("id", run.workflow_id).maybeSingle()).data?.name ?? null
    : run.segment_id
      ? (await admin.from("crm_segment").select("name").eq("id", run.segment_id).maybeSingle()).data?.name ?? null
      : null;

  // All log rows for this run — drives the result report, the recorded version, and the recipients.
  const { data: logData } = await admin
    .from("crm_message_log")
    .select("customer_id, channel, status, failure_cause, template_version, sent_at, delivered_at, bounced_at, complained_at, unsubscribed_at, opened_at, clicked_at, created_at")
    .eq("campaign_id", runId)
    .order("created_at", { ascending: false })
    .limit(2000);
  const logs = (logData ?? []) as {
    customer_id: string; channel: string; status: string; failure_cause: string | null;
    template_version: number | null; sent_at: string | null; delivered_at: string | null;
    bounced_at: string | null; complained_at: string | null; unsubscribed_at: string | null;
    opened_at: string | null; clicked_at: string | null; created_at: string;
  }[];

  // The version recipients actually received: the most common template_version among the log rows.
  const versionCounts = new Map<number, number>();
  for (const l of logs) if (l.template_version != null) versionCounts.set(l.template_version, (versionCounts.get(l.template_version) ?? 0) + 1);
  let templateVersion: number | null = null;
  let best = -1;
  for (const v of Array.from(versionCounts.keys())) {
    const n = versionCounts.get(v)!;
    if (n > best) { best = n; templateVersion = v; }
  }

  const result = {
    sent: logs.filter((l) => l.status === "sent" || l.status === "delivered" || l.sent_at != null).length,
    delivered: logs.filter((l) => l.delivered_at != null).length,
    bounced: logs.filter((l) => l.bounced_at != null).length,
    complained: logs.filter((l) => l.complained_at != null).length,
    unsubscribed: logs.filter((l) => l.unsubscribed_at != null).length,
    failed: logs.filter((l) => l.status === "failed").length,
  };
  // opened_at / clicked_at are never filled (webhook doesn't subscribe those events).
  const engagementMeasured = logs.some((l) => l.opened_at != null || l.clicked_at != null);

  // The four audience numbers, from the run's send-audit row (campaign.sent, keyed by campaign_id).
  let audience: DeliveryDetail["audience"] = null;
  const { data: auditData } = await admin
    .from("crm_audit_log")
    .select("metadata, occurred_at")
    .eq("action", "campaign.sent")
    .filter("metadata->>campaign_id", "eq", runId)
    .order("occurred_at", { ascending: false })
    .limit(1);
  const auditRow = (auditData ?? [])[0] as { metadata: Record<string, unknown> } | undefined;
  if (auditRow?.metadata) {
    const m = auditRow.metadata as Record<string, number>;
    const total = Number(m.recipient_total ?? 0);
    const noContact = Number(m.no_contact ?? 0);
    audience = {
      matched: total,
      hasEmail: Math.max(0, total - noContact),
      skippedSuppression: Number(m.skipped_suppressed ?? 0),
      sent: Number(m.sent ?? 0),
    };
  }

  // Preview the EXACT version sent (fall back to the latest active only if no version was recorded).
  let preview: DeliveryDetail["preview"] = null;
  {
    let tq = admin.from("crm_message_template").select("subject, body, version").eq("template_key", run.template_key);
    tq = templateVersion != null ? tq.eq("version", templateVersion) : tq.order("version", { ascending: false });
    const { data: tpl } = await tq.limit(1).maybeSingle();
    const t = tpl as { subject: string | null; body: string } | null;
    if (t) {
      // Render the stored body through the SAME skeleton the send path uses. A sample unsubscribe URL
      // stands in for the per-recipient signed link (this is a preview, not a live message).
      const { html } = renderEmailDocument(t.body, "https://crm.20fit.id/unsubscribe?token=preview");
      preview = { subject: t.subject, html };
    }
  }

  // Recipients (names resolved, contact never shown) — reuse the same resolver as the list view.
  const ids = Array.from(new Set(logs.map((l) => l.customer_id)));
  const names = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: profs } = await admin.from("master_customer").select("customer_id, full_name").in("customer_id", chunk);
    for (const p of (profs ?? []) as { customer_id: string; full_name: string | null }[]) names.set(p.customer_id, p.full_name);
  }
  const recipients: DeliveryRecipient[] = logs.map((l) => ({
    name: names.get(l.customer_id) ?? null,
    channel: l.channel,
    status: l.status,
    failureCause: l.failure_cause,
    createdAt: l.created_at,
  }));

  return {
    runId: run.id,
    label: run.label,
    ownerName,
    source,
    templateKey: run.template_key,
    templateVersion,
    status: run.status,
    createdAt: run.created_at,
    createdBy: run.created_by,
    lastError: run.last_error,
    audience,
    result,
    preview,
    engagementMeasured,
    recipients,
  };
}
