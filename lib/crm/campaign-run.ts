import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextRunStatus, type RunStatus } from "./campaign-run-status";

export { nextRunStatus, type RunStatus };

/**
 * crm_campaign_run store (K-41, form B). One row per campaign INSTANCE ("issue"). Its id becomes
 * crm_message_log.campaign_id, so the deterministic idempotency key {campaign_id}:{customer}:{channel}
 * is scoped to the run:
 *   - RESUMING one run → same id → same keys → already-sent recipients are skipped (a run that broke
 *     at row 6,000 continues without double-sending; a segment larger than the daily quota finishes
 *     across days by resuming the SAME run).
 *   - A NEW run → new id → new keys → the same person can be messaged again (next newsletter issue).
 * The id is a stable uuid for the life of the run — never per-attempt (that would break resume, the
 * same ban as a random idempotency_key, K-38 correction 2). This module never sends; it only records
 * the instance and reports how far each one has progressed.
 */

export interface CampaignRun {
  id: string;
  segmentId: string | null; // set for a campaign run; null for a workflow run (XOR with workflowId)
  workflowId: string | null; // set for a workflow run; null for a campaign run (XOR with segmentId)
  templateKey: string;
  label: string | null;
  status: RunStatus;
  createdBy: string | null;
  createdAt: string;
}

/** A run the operator may CONTINUE (draft or sending), annotated with how many messages it has
 *  already logged/sent — so "resume" is a fully-informed choice, not a leap in the dark. */
export interface ResumableRun extends CampaignRun {
  sentCount: number; // rows with status 'sent' for this run
  loggedCount: number; // all rows (queued/sent/failed/bounced) for this run — the resume floor
}

interface RunRow {
  id: string;
  segment_id: string | null;
  workflow_id: string | null;
  template_key: string;
  label: string | null;
  status: RunStatus;
  created_by: string | null;
  created_at: string;
}

const RUN_COLS = "id, segment_id, workflow_id, template_key, label, status, created_by, created_at";

function toRun(r: RunRow): CampaignRun {
  return {
    id: r.id,
    segmentId: r.segment_id,
    workflowId: r.workflow_id,
    templateKey: r.template_key,
    label: r.label,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** Create a new run instance, owned by EITHER a segment (campaign) OR a workflow — never both, never
 *  neither (crm_campaign_run_owner_xor enforces it in the DB, T-38 fix). Returns the run whose id will
 *  be used as crm_message_log.campaign_id. Status starts 'draft' until the first send flips it to
 *  'sending'. Passing the wrong owner id (e.g. a workflow id as segmentId, the original T-38 bug) now
 *  fails the FK/XOR loudly instead of silently, and the caller sees null → run_create_failed. */
export async function createRun(input: {
  segmentId?: string | null;
  workflowId?: string | null;
  templateKey: string;
  label: string | null;
  createdBy: string | null;
}): Promise<CampaignRun | null> {
  try {
    const admin = createAdminClient();
    const label = input.label?.trim() ? input.label.trim() : null;
    const { data, error } = await admin
      .from("crm_campaign_run")
      .insert({
        segment_id: input.segmentId ?? null,
        workflow_id: input.workflowId ?? null,
        template_key: input.templateKey,
        label,
        created_by: input.createdBy,
        status: "draft",
      })
      .select(RUN_COLS)
      .single();
    if (error || !data) return null;
    return toRun(data as RunRow);
  } catch {
    return null;
  }
}

/** Load one run and confirm it targets the (segment, template) the operator is composing against —
 *  a run id can't be repurposed onto a different segment/template than it was created for. */
export async function getRunForPair(
  runId: string,
  segmentId: string,
  templateKey: string,
): Promise<CampaignRun | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_campaign_run")
      .select(RUN_COLS)
      .eq("id", runId)
      .single();
    if (error || !data) return null;
    const run = toRun(data as RunRow);
    if (run.segmentId !== segmentId || run.templateKey !== templateKey) return null;
    return run;
  } catch {
    return null;
  }
}

/** Runs the operator may continue for this (segment, template): status in draft/sending, newest
 *  first, each annotated with its already-sent / already-logged counts from crm_message_log. A run
 *  marked 'sent' or 'stopped' is intentionally NOT offered — it is finished; a fresh issue is a new
 *  run. */
export async function listResumableRuns(segmentId: string, templateKey: string): Promise<ResumableRun[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_campaign_run")
      .select(RUN_COLS)
      .eq("segment_id", segmentId)
      .eq("template_key", templateKey)
      .in("status", ["draft", "sending"])
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    const runs = (data as RunRow[]).map(toRun);
    return Promise.all(
      runs.map(async (run) => {
        const [{ count: sent }, { count: logged }] = await Promise.all([
          admin
            .from("crm_message_log")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", run.id)
            .eq("status", "sent"),
          admin
            .from("crm_message_log")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", run.id),
        ]);
        return { ...run, sentCount: sent ?? 0, loggedCount: logged ?? 0 };
      }),
    );
  } catch {
    return [];
  }
}

/** Move a run to 'sending' just before a send begins (draft → sending). Idempotent for a resume that
 *  is already 'sending'. Best-effort: a failed status write must not block the send itself. */
export async function markRunSending(runId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("crm_campaign_run").update({ status: "sending" }).eq("id", runId);
  } catch {
    // status is a convenience annotation, not the source of truth; the log rows are.
  }
}

/**
 * Set the run's status from a completed send's summary (see nextRunStatus for the rule). Best-effort;
 * the crm_message_log rows remain the authoritative record of what was sent.
 */
export async function finalizeRunStatus(
  runId: string,
  summary: { deferredDailyLimit: number; stoppedHighBounce: boolean },
): Promise<RunStatus> {
  const next = nextRunStatus(summary);
  try {
    const admin = createAdminClient();
    await admin.from("crm_campaign_run").update({ status: next }).eq("id", runId);
  } catch {
    // ignore — annotation only
  }
  return next;
}

/**
 * Record that a run HALTED before/without completing a send: status → 'stopped', last_error → a
 * PII-free classified cause. So a failed run leaves a reason in the row itself, not silence (T-30) —
 * the same lesson as the four-state reset error and the truncated export with no end marker.
 * Best-effort: if even this write fails, the caller still surfaces the error to the operator.
 */
export async function recordRunError(runId: string, cause: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("crm_campaign_run").update({ status: "stopped", last_error: cause }).eq("id", runId);
  } catch {
    // nothing more we can do here; the action-layer error return is the other half of the trace.
  }
}
