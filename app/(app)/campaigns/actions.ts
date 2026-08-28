"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { isPermitted, grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { previewCampaign, sendCampaign, emailListToRecipients } from "@/lib/crm/send-campaign";
import { describeCountDrift, planDailySpread, type CountDrift, type DailySpread } from "@/lib/crm/send-plan";
import { DEFAULT_SEND_CONFIG, requiresLargeSendConfirmation, type SendSummary } from "@/lib/crm/send-run";
import {
  createRun,
  getRunForPair,
  listResumableRuns,
  markRunSending,
  finalizeRunStatus,
  recordRunError,
  type ResumableRun,
  type RunStatus,
} from "@/lib/crm/campaign-run";
import { classifySendThrow, unsubscribeHostServable } from "@/lib/crm/send-env";
import { headers } from "next/headers";
import { runInternalSendTest, cleanupInternalSendTest, type SendTestResult, type SendTestCleanupResult } from "@/lib/crm/send-test-harness";
import { extractVariables } from "@/lib/crm/template";

export type InternalTestResult = SendTestResult | { ok: false; error: "denied" };

/**
 * Campaign compose server actions. Every path re-checks the clinical gate against the USING role
 * (not the segment's creator) and refuses a template with no unsubscribe variable — both are
 * preconditions in code, not conventions.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Serving host from the request, or undefined if unavailable. */
function servingHost(): string | undefined {
  try {
    return headers().get("host") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pre-send gate: refuse if the unsubscribe link's host ≠ the host actually serving the app. An email
 * whose unsubscribe link is dead (points at a domain not yet resolving) is WORSE than not sending —
 * recipients who want out can't, and mark it spam. Owner request 25 Aug 2026. Best-effort: skips only
 * when the serving host can't be read (never blocks on "unknown").
 */
function unsubscribeHostBlocked(): { linkHost: string | null; servingHost: string | null } | null {
  const r = unsubscribeHostServable(process.env.NEXT_PUBLIC_APP_URL, servingHost());
  return r.ok ? null : { linkHost: r.linkHost, servingHost: r.servingHost };
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
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr, emailList: seg.stored.emailList },
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
    | "run_create_failed"
    | "send_threw" // sendCampaign threw; the run is marked stopped + last_error (see detail)
    | "unsubscribe_host_mismatch"; // unsubscribe link host ≠ serving host → dead link, refuse
  detail?: string; // on 'send_threw': PII-free classified cause (also written to run.last_error)
  linkHost?: string | null; // on 'unsubscribe_host_mismatch': the host the unsubscribe link points to
  servingHost?: string | null; // on 'unsubscribe_host_mismatch': the host actually serving the app
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

  // Refuse before any run is created if the unsubscribe link would be dead (host ≠ serving host).
  const hostBlock = unsubscribeHostBlocked();
  if (hostBlock) return { ok: false, error: "unsubscribe_host_mismatch", linkHost: hostBlock.linkHost, servingHost: hostBlock.servingHost };

  const stamp = nowIso();
  // RECOUNT at confirm — the shown number may be stale. Disclose any drift BEFORE the send counts.
  const fresh = await previewCampaign(
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr, emailList: seg.stored.emailList },
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

  // If the send throws (e.g. a required secret is unset), the run records WHY — status stopped +
  // last_error — and the operator gets a structured error, instead of a silent draft (T-30).
  let result: Awaited<ReturnType<typeof sendCampaign>>;
  try {
    result = await sendCampaign(
      {
        campaignId: runId,
        criteria: seg.stored.criteria,
        masterFilterExpr: seg.stored.masterFilterExpr,
        templateKey: args.templateKey,
        actorId,
        actorEmail,
        confirmedLargeSend: args.confirmedLargeSend,
        ...(seg.stored.emailList && seg.stored.emailList.length > 0
          ? { overrideRecipients: emailListToRecipients(seg.stored.emailList) }
          : {}),
      },
      stamp,
    );
  } catch (e) {
    const cause = classifySendThrow(e);
    await recordRunError(runId, cause);
    return { ok: false, error: "send_threw", detail: cause, runId, runLabel, isNewRun };
  }

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
export interface PreviewEmailResult {
  ok: boolean;
  error?: "denied" | "missing_env" | "no_template" | "send_failed";
  detail?: string;
  sentTo?: string[];
}

/**
 * Send a preview email directly via Mailtrap — uses the real send path but to specified
 * addresses only, bypassing the campaign engine/harness. For admin review before campaign send.
 */
export async function sendPreviewEmailAction(
  toEmails: string[],
  templateKey: string,
): Promise<PreviewEmailResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const admin = createAdminClient();
  const { data: tplData } = await admin
    .from("crm_message_template")
    .select("name, subject, body")
    .eq("template_key", templateKey)
    .eq("channel", "email")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tplData) return { ok: false, error: "no_template" };
  const tpl = tplData as { name: string; subject: string | null; body: string };

  // Replace template variables with placeholder values for preview
  const previewUnsubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.20fit.id"}/unsubscribe?token=PREVIEW`;
  const body = tpl.body
    .replace(/\{\{unsubscribe_url\}\}/g, previewUnsubUrl)
    .replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  const subject = `[PREVIEW] ${tpl.subject ?? tpl.name}`;

  const { sendTransactionalEmail } = await import("@/lib/email/mailtrap");
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const to of toEmails) {
    try {
      await sendTransactionalEmail({ to, subject, text: body.replace(/<[^>]+>/g, ""), html: body }, "campaign-preview");
      sentTo.push(to);
    } catch {
      errors.push(to);
    }
  }

  if (sentTo.length === 0) return { ok: false, error: "send_failed", detail: errors.join(", ") };
  return { ok: true, sentTo };
}

export async function runInternalSendTestAction(quickEmail?: string): Promise<InternalTestResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  const hostBlock = unsubscribeHostBlocked();
  if (hostBlock) return { ok: false, error: "unsubscribe_host_mismatch", linkHost: hostBlock.linkHost, servingHost: hostBlock.servingHost };
  let actorId = "unknown";
  let actorEmail: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    actorId = data.user?.id ?? "unknown";
    actorEmail = data.user?.email ?? null;
  } catch {
    // fail-closed identity
  }

  // Resolve targets: UI quick-input > crm_test_recipient list > env var fallback (in harness).
  let overrideTargets: string[] | undefined;
  if (quickEmail) {
    overrideTargets = [quickEmail.trim().toLowerCase()];
  } else {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("crm_test_recipient")
        .select("email")
        .eq("is_active", true)
        .order("added_at", { ascending: true });
      const emails = (data ?? []).map((r: { email: string }) => r.email).filter(Boolean);
      if (emails.length > 0) overrideTargets = emails;
    } catch {
      // fall through to env var fallback in harness
    }
  }

  return runInternalSendTest({ actorId, actorEmail }, overrideTargets);
}

export type InternalTestCleanupResult = SendTestCleanupResult | { ok: false; error: "denied" };

export async function cleanupInternalSendTestAction(): Promise<InternalTestCleanupResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  return cleanupInternalSendTest();
}
