"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { isPermitted, grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { previewCampaign, sendCampaign, resolveEmailListRecipients } from "@/lib/crm/send-campaign";
import { renderEmailDocument } from "@/lib/crm/email-document";
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
import { classifySendThrow, unsubscribeHostServable, missingSendEnv } from "@/lib/crm/send-env";
import { headers } from "next/headers";
import { runInternalSendTest, cleanupInternalSendTest, type SendTestResult, type SendTestCleanupResult } from "@/lib/crm/send-test-harness";
import { extractVariables } from "@/lib/crm/template";
import {
  wibToUtcIso,
  insertScheduledSend,
  listScheduledSends,
  cancelScheduledSend,
  type ScheduledSend,
} from "@/lib/crm/scheduled-send";

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
  unresolved?: string[]; // manual email-list addresses not in the pool → cannot be a recipient
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
    unresolved: p.unresolved,
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
    | "missing_env" // required send env vars unset — reported ALL at once (see detail)
    | "unresolvable_recipients" // manual email-list addresses not in the pool — refuse BEFORE a run (see detail)
    | "unsubscribe_host_mismatch"; // unsubscribe link host ≠ serving host → dead link, refuse
  detail?: string; // on 'send_threw'/'unresolvable_recipients': PII-free cause / named addresses
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

  // Pre-check required send env vars BEFORE creating a run — a doomed send should not leave an
  // orphan draft run behind. Reports ALL missing at once (T-30 lesson).
  const missing = missingSendEnv();
  if (missing.length > 0) {
    return { ok: false, error: "missing_env", detail: missing.map((m) => m.name).join(", ") };
  }

  // Manual email-list segment: RESOLVE every address to a real master_customer uuid BEFORE creating
  // a run. Any address not in the pool cannot be a recipient (no customer_id → the send would throw
  // on the uuid insert, and its unsubscribe link would have no identity to suppress). Refuse the whole
  // send here, NAMING the addresses, so the operator learns immediately instead of a silent stopped
  // run — internal test addresses belong in the Send-test / crm_test_recipient path, not here.
  let emailRecipients: Awaited<ReturnType<typeof resolveEmailListRecipients>>["recipients"] | undefined;
  if (seg.stored.emailList && seg.stored.emailList.length > 0) {
    const resolved = await resolveEmailListRecipients(createAdminClient(), seg.stored.emailList);
    if (resolved.unresolved.length > 0) {
      return { ok: false, error: "unresolvable_recipients", detail: resolved.unresolved.join(", ") };
    }
    emailRecipients = resolved.recipients;
  }

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
        ...(emailRecipients ? { overrideRecipients: emailRecipients } : {}),
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

// ── Scheduled send: same gates as sendCampaignAction, but stores a pending row instead of sending.
export interface ScheduleResult {
  ok: boolean;
  error?: SendResult["error"] | "bad_time" | "time_in_past" | "schedule_failed";
  detail?: string; // on 'unresolvable_recipients': the named addresses not in the pool
  drift?: CountDrift;
  freshSendable?: number;
  scheduledAtUtc?: string;
  linkHost?: string | null;
  servingHost?: string | null;
}

export async function scheduleCampaignAction(args: {
  segmentId: string;
  templateKey: string;
  confirmedLargeSend: boolean;
  shownSendable: number;
  runLabel: string | null;
  dateWib: string; // "YYYY-MM-DD"
  timeWib: string; // "HH:MM"
}): Promise<ScheduleResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const seg = await getSegmentById(args.segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  if (seg.requiresClinical && !isPermitted(role, "profile.view_health")) return { ok: false, error: "clinical_gate" };
  if (!(await templateHasUnsubscribe(args.templateKey))) return { ok: false, error: "no_unsubscribe" };

  const hostBlock = unsubscribeHostBlocked();
  if (hostBlock) return { ok: false, error: "unsubscribe_host_mismatch", linkHost: hostBlock.linkHost, servingHost: hostBlock.servingHost };

  const scheduledAtUtc = wibToUtcIso(args.dateWib, args.timeWib);
  if (!scheduledAtUtc) return { ok: false, error: "bad_time" };
  if (new Date(scheduledAtUtc).getTime() <= Date.now()) return { ok: false, error: "time_in_past" };

  // Recount + drift disclosure, same as the immediate send — so the scheduled count is honest now.
  const fresh = await previewCampaign(
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr, emailList: seg.stored.emailList },
    nowIso(),
  );
  // Refuse a scheduled send to a manual list with addresses not in the pool (same rule as immediate
  // send) — a doomed schedule should never be stored. Named, before any row is written.
  if (fresh.unresolved.length > 0) {
    return { ok: false, error: "unresolvable_recipients", detail: fresh.unresolved.join(", ") };
  }
  const drift = describeCountDrift(args.shownSendable, fresh.sendable);
  if (drift.changed) return { ok: false, error: "count_changed", drift, freshSendable: fresh.sendable };
  if (requiresLargeSendConfirmation(fresh.sendable) && !args.confirmedLargeSend) {
    return { ok: false, error: "needs_confirm", drift };
  }

  let createdBy: string | null = null;
  try {
    createdBy = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch { /* fail-open on identity */ }

  const res = await insertScheduledSend(createAdminClient(), {
    segmentId: args.segmentId,
    templateKey: args.templateKey,
    runLabel: args.runLabel,
    scheduledAtUtc,
    confirmedLargeSend: args.confirmedLargeSend,
    shownSendable: fresh.sendable,
    createdBy,
  });
  if (!res.ok) return { ok: false, error: "schedule_failed" };
  return { ok: true, scheduledAtUtc };
}

export async function listScheduledSendsAction(): Promise<{ ok: boolean; sends: ScheduledSend[] }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, sends: [] };
  return { ok: true, sends: await listScheduledSends(createAdminClient()) };
}

export async function cancelScheduledSendAction(id: string): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  return cancelScheduledSend(createAdminClient(), id);
}

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

  // Replace template variables with placeholder values for preview, then compose through the SAME
  // email skeleton the real send uses (so a Send-test reflects the exact frame that ships).
  const previewUnsubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.20fit.id"}/unsubscribe?token=PREVIEW`;
  const substituted = tpl.body
    .replace(/\{\{unsubscribe_url\}\}/g, previewUnsubUrl)
    .replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  const { html, text } = renderEmailDocument(substituted, previewUnsubUrl);
  const subject = `[PREVIEW] ${tpl.subject ?? tpl.name}`;

  const { sendTransactionalEmail } = await import("@/lib/email/mailtrap");
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const to of toEmails) {
    try {
      await sendTransactionalEmail({ to, subject, text, html }, "campaign-preview");
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
