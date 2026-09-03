import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isResumableRunStatus,
  nextRunStatus,
  RESUMABLE_RUN_STATUSES,
  type RunOutcomeCounts,
  type RunStatus,
} from "./campaign-run-status";
import { dominantFailureCause, totalFailed, type SendSummary } from "./send-run";

export { nextRunStatus, RESUMABLE_RUN_STATUSES, type RunStatus };

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
    // Second lock on the SAME rule as listResumableRuns. The list is what the composer offers, but
    // the run id travels from the client, so the id of a finished run could be handed back here
    // directly. Re-checking the status is what makes "a finished run is finished" a rule rather than
    // a UI convention — with the 3 Sep run (status 'sent', 18,119 failures) sitting in the table,
    // the difference is 18k people being contacted twice.
    if (!isResumableRunStatus(run.status)) return null;
    return run;
  } catch {
    return null;
  }
}

/** Runs the operator may continue for this (segment, template): status in draft/sending, newest
 *  first, each annotated with its already-sent / already-logged counts from crm_message_log. A run
 *  marked 'sent', 'stopped', 'partial' or 'failed' is intentionally NOT offered — it is finished or
 *  halted; a fresh issue is a new run. */
export async function listResumableRuns(segmentId: string, templateKey: string): Promise<ResumableRun[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_campaign_run")
      .select(RUN_COLS)
      .eq("segment_id", segmentId)
      .eq("template_key", templateKey)
      // The resumable set is the NAMED constant, never an inline list: 'partial' and 'failed' (T-42)
      // must never leak into it — that is what would let a run that failed 18k times be resumed.
      .in("status", RESUMABLE_RUN_STATUSES as readonly string[] as string[])
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

/** The PII-free reason written to crm_campaign_run.last_error when the wall stopped a run. Composed
 *  entirely from OUR OWN vocabulary — a count and a failure-class name — never provider text. */
export function consecutiveFailureReason(summary: SendSummary): string {
  const cause = dominantFailureCause(summary.failed);
  // failed_total is the run's TOTAL failures, which is >= the 20-in-a-row that tripped the halt —
  // labelled as a total so it is never read as the streak length.
  const total = String(totalFailed(summary.failed));
  return cause
    ? `stopped_consecutive_failures failed_total=${total} top_cause=${cause}`
    : `stopped_consecutive_failures failed_total=${total}`;
}

/** Reduce a send summary to the counts the status rule reads. One place, so no call site can hand-
 *  build the object and leave the failure counts out — which is exactly the defect being fixed. */
export function runOutcomeOf(summary: SendSummary): RunOutcomeCounts {
  return {
    sent: summary.sent,
    failed: totalFailed(summary.failed),
    deferredDailyLimit: summary.deferredDailyLimit,
    stoppedHighBounce: summary.stoppedHighBounce,
    stoppedConsecutiveFailures: summary.stoppedConsecutiveFailures,
  };
}

/**
 * Set the run's status from a completed send's summary (see nextRunStatus for the rule). Best-effort;
 * the crm_message_log rows remain the authoritative record of what was sent. Takes the WHOLE summary
 * — not a hand-picked pair of fields — so a run that failed cannot be filed as 'sent' because the
 * caller forgot to pass the failure counts (T-42).
 */
export async function finalizeRunStatus(runId: string, summary: SendSummary): Promise<RunStatus> {
  // A run halted by the consecutive-failure wall (rule 7) records WHY, not just that it stopped —
  // same contract as a run that threw (T-30). recordRunError writes status 'stopped' + last_error,
  // which is the status nextRunStatus would return anyway, so the two agree.
  if (summary.stoppedConsecutiveFailures) {
    await recordRunError(runId, consecutiveFailureReason(summary));
    return "stopped";
  }
  const next = nextRunStatus(runOutcomeOf(summary));
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
