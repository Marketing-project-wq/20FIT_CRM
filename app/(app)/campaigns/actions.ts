"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { isPermitted, grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { previewCampaign, sendCampaign } from "@/lib/crm/send-campaign";
import { describeCountDrift, planDailySpread, type CountDrift, type DailySpread } from "@/lib/crm/send-plan";
import { DEFAULT_SEND_CONFIG, requiresLargeSendConfirmation, type SendSummary } from "@/lib/crm/send-run";
import {
  createRun,
  getRunForPair,
  listResumableRuns,
  markRunSending,
  finalizeRunStatus,
  type ResumableRun,
  type RunStatus,
} from "@/lib/crm/campaign-run";
import { runInternalSendTest, cleanupInternalSendTest, type SendTestResult, type SendTestCleanupResult } from "@/lib/crm/send-test-harness";
import { extractVariables } from "@/lib/crm/template";

/**
 * Campaign compose server actions. Every path re-checks the clinical gate against the USING role
 * (not the segment's creator) and refuses a template with no unsubscribe variable — both are
 * preconditions in code, not conventions.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** An email template is eligible only if its body references {{unsubscribe_url}} — a campaign email
 *  without the link must not be sendable at all (mirrored at send time by assertHasUnsubscribeLink). */
async function templateHasUnsubscribe(templateKey: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("crm_message_template")
      .select("body, subject")
      .eq("template_key", templateKey)
      .eq("channel", "email")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (!data) return false;
    const row = data as { body: string; subject: string | null };
    return extractVariables(`${row.subject ?? ""}\n${row.body}`).includes("unsubscribe_url");
  } catch {
    return false;
  }
}

export interface PreviewResult {
  ok: boolean;
  error?: "denied" | "not_found" | "clinical_gate" | "no_unsubscribe";
  segmentName?: string;
  matched?: number;
  withEmail?: number;
  noContact?: number;
  suppressed?: number;
  sendable?: number;
  needsLargeConfirm?: boolean;
  spread?: DailySpread;
}

export async function previewCampaignAction(segmentId: string, templateKey: string): Promise<PreviewResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const seg = await getSegmentById(segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  // Clinical gate re-checked on the USING role, not the creator (K-40).
  if (seg.requiresClinical && !isPermitted(role, "profile.view_health")) return { ok: false, error: "clinical_gate" };
  if (!(await templateHasUnsubscribe(templateKey))) return { ok: false, error: "no_unsubscribe" };

  const p = await previewCampaign(
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr },
    nowIso(),
  );
  return {
    ok: true,
    segmentName: seg.name,
    matched: p.matched,
    withEmail: p.withEmail,
    noContact: p.noContact,
    suppressed: p.suppressed,
    sendable: p.sendable,
    needsLargeConfirm: requiresLargeSendConfirmation(p.sendable),
    spread: planDailySpread(p.sendable, p.remainingDailyBudget, DEFAULT_SEND_CONFIG.dailyLimit),
  };
}

/** A campaign run (instance) the operator may continue for the picked (segment, template). Surfaced
 *  so "resume" is an explicit, informed choice next to "start a new run" — never implied. */
export interface RunOption {
  id: string;
  label: string | null;
  status: RunStatus;
  sentCount: number; // already sent in this run — resuming skips these
  loggedCount: number; // all rows already recorded for this run
  createdAt: string;
}

export interface RunsResult {
  ok: boolean;
  error?: "denied" | "not_found";
  runs?: RunOption[];
}

/** List the resumable runs for a (segment, template) so the composer can offer "continue run X
 *  (N already sent)" distinctly from "start a new run". Read-only; creates nothing. */
export async function listRunsAction(segmentId: string, templateKey: string): Promise<RunsResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  const seg = await getSegmentById(segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  const runs = await listResumableRuns(segmentId, templateKey);
  return {
    ok: true,
    runs: runs.map((r: ResumableRun) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      sentCount: r.sentCount,
      loggedCount: r.loggedCount,
      createdAt: r.createdAt,
    })),
  };
}

/** Which instance a send targets: continue an existing run, or open a new one. The distinction is
 *  the whole point of crm_campaign_run — a new run re-sends to the same people (next issue); resuming
 *  the same run skips whoever it already reached. */
export type RunChoice = { kind: "resume"; runId: string } | { kind: "new"; label: string | null };

export interface SendResult {
  ok: boolean;
  error?:
    | "denied"
    | "not_found"
    | "clinical_gate"
    | "no_unsubscribe"
    | "needs_confirm"
    | "count_changed"
    | "run_not_found"
    | "run_create_failed";
  drift?: CountDrift; // recount at confirm vs what the operator saw
  freshSendable?: number; // the recounted number to show + re-press against (on count_changed)
  summary?: SendSummary;
  withheldPrelaunch?: number;
  realSend?: boolean;
  runId?: string; // the instance this send targeted (crm_message_log.campaign_id)
  runLabel?: string | null;
  isNewRun?: boolean; // true if this send opened a fresh instance (vs continued one)
  runStatus?: RunStatus; // where the run landed after this send (sent / sending / stopped)
}

export async function sendCampaignAction(args: {
  segmentId: string;
  templateKey: string;
  confirmedLargeSend: boolean;
  shownSendable: number; // the number the operator saw when they pressed send
  run: RunChoice; // resume an existing instance or open a new one — required, never implied
}): Promise<SendResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const seg = await getSegmentById(args.segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  if (seg.requiresClinical && !isPermitted(role, "profile.view_health")) return { ok: false, error: "clinical_gate" };
  if (!(await templateHasUnsubscribe(args.templateKey))) return { ok: false, error: "no_unsubscribe" };

  const stamp = nowIso();
  // RECOUNT at confirm — the shown number may be stale. Disclose any drift BEFORE the send counts.
  const fresh = await previewCampaign(
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr },
    stamp,
  );
  const drift = describeCountDrift(args.shownSendable, fresh.sendable);

  // DISCLOSE DRIFT BEFORE SENDING: if the recount differs from what the operator saw, DO NOT send —
  // return the fresh number so the form can say so and require a second press against it. No run row
  // is created on this path, so a drift bounce never leaves an orphan draft instance.
  if (drift.changed) {
    return { ok: false, error: "count_changed", drift, freshSendable: fresh.sendable };
  }

  if (requiresLargeSendConfirmation(fresh.sendable) && !args.confirmedLargeSend) {
    return { ok: false, error: "needs_confirm", drift };
  }

  // Resolve the INSTANCE only after all gates pass — a new run is created here (not on a drift/confirm
  // bounce). campaignId = this run's id → the idempotency key is scoped to the instance: resuming the
  // same run skips whoever it already reached; a new run may reach them again.
  let runId: string;
  let runLabel: string | null;
  let isNewRun: boolean;
  if (args.run.kind === "resume") {
    const existing = await getRunForPair(args.run.runId, args.segmentId, args.templateKey);
    if (!existing) return { ok: false, error: "run_not_found" };
    runId = existing.id;
    runLabel = existing.label;
    isNewRun = false;
  } else {
    let actorForRun: string | null = null;
    try {
      actorForRun = (await createClient().auth.getUser()).data.user?.email ?? null;
    } catch {
      actorForRun = null;
    }
    const created = await createRun({
      segmentId: args.segmentId,
      templateKey: args.templateKey,
      label: args.run.label,
      createdBy: actorForRun,
    });
    if (!created) return { ok: false, error: "run_create_failed" };
    runId = created.id;
    runLabel = created.label;
    isNewRun = true;
  }

  let actorId = "unknown";
  let actorEmail: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    actorId = data.user?.id ?? "unknown";
    actorEmail = data.user?.email ?? null;
  } catch {
    // fail-closed identity; the send still records a row, audit actor is 'unknown'
  }

  await markRunSending(runId);

  const result = await sendCampaign(
    {
      campaignId: runId,
      criteria: seg.stored.criteria,
      masterFilterExpr: seg.stored.masterFilterExpr,
      templateKey: args.templateKey,
      actorId,
      actorEmail,
      confirmedLargeSend: args.confirmedLargeSend,
    },
    stamp,
  );

  const runStatus = await finalizeRunStatus(runId, {
    deferredDailyLimit: result.summary.deferredDailyLimit,
    stoppedHighBounce: result.summary.stoppedHighBounce,
  });

  return {
    ok: true,
    drift,
    summary: result.summary,
    withheldPrelaunch: result.withheldPrelaunch,
    realSend: result.realSend,
    runId,
    runLabel,
    isNewRun,
    runStatus,
  };
}

/**
 * Internal send-test harness actions (pre-launch only). Same send.* gate as the composer, then the
 * harness enforces safe-mode + internal-target guards. See lib/crm/send-test-harness.ts.
 */
export type InternalTestResult = SendTestResult | { ok: false; error: "denied" };

export async function runInternalSendTestAction(): Promise<InternalTestResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  let actorId = "unknown";
  let actorEmail: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    actorId = data.user?.id ?? "unknown";
    actorEmail = data.user?.email ?? null;
  } catch {
    // fail-closed identity; the audit actor is 'unknown'
  }
  return runInternalSendTest({ actorId, actorEmail });
}

export type InternalTestCleanupResult = SendTestCleanupResult | { ok: false; error: "denied" };

export async function cleanupInternalSendTestAction(): Promise<InternalTestCleanupResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  return cleanupInternalSendTest();
}
