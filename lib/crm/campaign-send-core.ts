import "server-only";

import { isPermitted, grantFor, type Role } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { previewCampaign, resolveEmailListRecipients } from "@/lib/crm/send-campaign";
import { getSendConfig } from "@/lib/crm/send-config";
import { enqueueRunDrain } from "@/lib/crm/send-drain";
import { decideRunLabel, validateCampaignName } from "@/lib/crm/campaign-name";
import { renderEmailDocument } from "@/lib/crm/email-document";
import { inlineEmailCss } from "@/lib/crm/css-inline";
import { describeCountDrift, planDailySpread, type CountDrift, type DailySpread } from "@/lib/crm/send-plan";
import { requiresLargeSendConfirmation } from "@/lib/crm/send-run";
import { createRun, getRunForPair, activeSendingRunFor, recordRunError, type RunStatus } from "@/lib/crm/campaign-run";
import { unsubscribeHostServable, missingSendEnv } from "@/lib/crm/send-env";
import { extractVariables, renderTemplate } from "@/lib/crm/template";
import { replaceMergePlaceholders } from "@/lib/crm/merge-fields";
import { normalizeEmail } from "@/lib/crm/normalize";
import { wibToUtcIso, insertScheduledSend } from "@/lib/crm/scheduled-send";

/**
 * The campaign send path, independent of HOW the caller is identified. Two callers share it so the
 * gates can never drift apart:
 *   - the Campaigns composer (app/(app)/campaigns/actions.ts) — actor from the browser session;
 *   - Agent Mail (app/api/mcp) — actor from a signed agent token, role re-read on every call.
 * Every gate lives here: send permission, clinical gate on the USING role, {{unsubscribe_url}},
 * campaign name, unsubscribe-host check, required env, email-list resolution, recount drift,
 * large-send confirmation, double-send guard, async drain.
 */

export interface SendActor {
  role: Role | null;
  /** Shown as the run's created_by and the drain's requested_by (audit actor_email). */
  email: string | null;
}

export type MergeRow = { email: string; rowIndex: number; fields: Record<string, string> };

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Pre-send gate: refuse if the unsubscribe link's host ≠ the host actually serving the app. An email
 * whose unsubscribe link is dead (points at a domain not yet resolving) is WORSE than not sending —
 * recipients who want out can't, and mark it spam. Owner request 25 Aug 2026. Best-effort: skips only
 * when the serving host can't be read (never blocks on "unknown").
 */
export function unsubscribeHostBlocked(servingHost: string | undefined): { linkHost: string | null; servingHost: string | null } | null {
  const r = unsubscribeHostServable(process.env.NEXT_PUBLIC_APP_URL, servingHost);
  return r.ok ? null : { linkHost: r.linkHost, servingHost: r.servingHost };
}

/** An email template is eligible only if its body references {{unsubscribe_url}} — a campaign email
 *  without the link must not be sendable at all (mirrored at send time by assertHasUnsubscribeLink). */
export async function templateHasUnsubscribe(templateKey: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_message_template")
      .select("body, subject")
      .eq("template_key", templateKey)
      .eq("channel", "email")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return false;
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

export async function previewCampaignCore(actor: SendActor, segmentId: string, templateKey: string): Promise<PreviewResult> {
  if (grantFor(actor.role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const seg = await getSegmentById(segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  // Clinical gate re-checked on the USING role, not the creator (K-40).
  if (seg.requiresClinical && !isPermitted(actor.role, "profile.view_health")) return { ok: false, error: "clinical_gate" };
  if (!(await templateHasUnsubscribe(templateKey))) return { ok: false, error: "no_unsubscribe" };

  const { dailyLimit } = await getSendConfig(createAdminClient());
  const p = await previewCampaign(
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr, emailList: seg.stored.emailList, dailyLimit },
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
    spread: planDailySpread(p.sendable, p.remainingDailyBudget, dailyLimit),
    unresolved: p.unresolved,
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
    | "label_required" // new run with a missing/too-short/too-long name — refused before any work
    | "run_not_found"
    | "run_create_failed"
    | "send_in_progress" // a run to this (segment, template) is already in progress — a NEW run would double-send
    | "enqueue_failed" // the drain flag could not be written — nothing was queued
    | "missing_env" // required send env vars unset — reported ALL at once (see detail)
    | "unresolvable_recipients" // manual email-list addresses not in the pool — refuse BEFORE a run (see detail)
    | "unsubscribe_host_mismatch"; // unsubscribe link host ≠ serving host → dead link, refuse
  detail?: string; // on 'unresolvable_recipients': the named addresses
  linkHost?: string | null; // on 'unsubscribe_host_mismatch': the host the unsubscribe link points to
  servingHost?: string | null; // on 'unsubscribe_host_mismatch': the host actually serving the app
  drift?: CountDrift; // recount at confirm vs what the operator saw
  freshSendable?: number; // the recounted number to show + re-press against (on count_changed)
  // ASYNC (P0-3): the send no longer runs in this request. On success the run is QUEUED for background
  // draining and the operator watches progress in the Kampanye list — there is no synchronous summary.
  queued?: boolean; // true → the run was flagged for background draining
  sendable?: number; // how many recipients will be attempted in the background (the recounted number)
  runId?: string; // the instance this send targeted (crm_message_log.campaign_id)
  runLabel?: string | null;
  isNewRun?: boolean; // true if this send opened a fresh instance (vs continued one)
  runStatus?: RunStatus; // 'sending' — the run is now draining in the background
}

export interface SendArgs {
  segmentId: string;
  templateKey: string;
  confirmedLargeSend: boolean;
  shownSendable: number;
  run: RunChoice;
  mergeData?: MergeRow[];
}

export async function sendCampaignCore(actor: SendActor, args: SendArgs, servingHost: string | undefined): Promise<SendResult> {
  if (grantFor(actor.role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const seg = await getSegmentById(args.segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  if (seg.requiresClinical && !isPermitted(actor.role, "profile.view_health")) return { ok: false, error: "clinical_gate" };
  if (!(await templateHasUnsubscribe(args.templateKey))) return { ok: false, error: "no_unsubscribe" };

  // Campaign name is REQUIRED for a NEW run (server-side, never trusting the client). A resume reuses
  // the existing run's name, so it isn't re-validated. Refuse up front — no preview/run work on a
  // nameless campaign. The auto-generate default was removed from this compose path (owner request).
  const labelDecision = decideRunLabel(args.run);
  if (!labelDecision.ok) return { ok: false, error: "label_required" };
  const validatedNewName = labelDecision.label; // the validated new name, or null for a resume

  // Refuse before any run is created if the unsubscribe link would be dead (host ≠ serving host).
  const hostBlock = unsubscribeHostBlocked(servingHost);
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
  // send here, NAMING the addresses. The drainer re-resolves the list at send time (the recipients are
  // not carried on the run), so nothing is stored from here.
  if (seg.stored.emailList && seg.stored.emailList.length > 0) {
    const resolved = await resolveEmailListRecipients(createAdminClient(), seg.stored.emailList);
    if (resolved.unresolved.length > 0) {
      return { ok: false, error: "unresolvable_recipients", detail: resolved.unresolved.join(", ") };
    }
  }

  const stamp = nowIso();
  // RECOUNT at confirm — the shown number may be stale. Disclose any drift BEFORE the send counts.
  const fresh = await previewCampaign(
    { criteria: seg.stored.criteria, masterFilterExpr: seg.stored.masterFilterExpr, emailList: seg.stored.emailList },
    stamp,
  );
  const drift = describeCountDrift(args.shownSendable, fresh.sendable);

  // DISCLOSE DRIFT BEFORE SENDING: if the recount differs from what the operator saw, DO NOT send —
  // return the fresh number so the caller can say so and require a second press against it. No run
  // row is created on this path, so a drift bounce never leaves an orphan draft instance.
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
    // DOUBLE-SEND GUARD (ported from PR #45, widened to the async drain model). Refuse a NEW run to a
    // (segment, template) that already has one IN PROGRESS ('sending' — draining or paused). A second
    // run is a second campaign_id → different idempotency keys → idempotency can't de-dupe across it,
    // so everyone would be emailed twice. This is the exact 890-recipient ISS path: send looked failed,
    // operator nearly pressed Send again. Point them at the run already running; resuming it is safe.
    const active = await activeSendingRunFor(args.segmentId, args.templateKey);
    if (active) return { ok: false, error: "send_in_progress", runId: active.id, runLabel: active.label };

    const created = await createRun({
      segmentId: args.segmentId,
      templateKey: args.templateKey,
      // The name is required and already validated above (validatedNewName).
      label: validatedNewName,
      createdBy: actor.email,
    });
    if (!created) return { ok: false, error: "run_create_failed" };
    runId = created.id;
    runLabel = created.label;
    isNewRun = true;
  }

  // Upload merge data (mail-merge custom placeholders) for this run before enqueueing the drain.
  if (args.mergeData && args.mergeData.length > 0) {
    const admin = createAdminClient();
    await admin.from("crm_campaign_merge_data").delete().eq("run_id", runId);
    const insertRows: { run_id: string; email_normalized: string; field_name: string; field_value: string; row_index: number }[] = [];
    for (const row of args.mergeData) {
      const email = normalizeEmail(row.email);
      if (!email) continue;
      for (const [fieldName, fieldValue] of Object.entries(row.fields)) {
        insertRows.push({ run_id: runId, email_normalized: email, field_name: fieldName, field_value: fieldValue ?? "", row_index: row.rowIndex });
      }
    }
    for (let i = 0; i < insertRows.length; i += 500) {
      const chunk = insertRows.slice(i, i + 500);
      const { error } = await admin.from("crm_campaign_merge_data").insert(chunk);
      if (error) {
        // row_index column may not exist yet (migration pending) — retry without it.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const withoutRowIndex = chunk.map(({ row_index: _ri, ...rest }) => rest);
        const { error: e2 } = await admin.from("crm_campaign_merge_data").insert(withoutRowIndex);
        if (e2) return { ok: false as const, error: "enqueue_failed" as const };
      }
    }
  }

  // ASYNC SEND (P0-3). Flag the run for background draining (drain_active=true, status 'sending') and
  // return immediately; the pg_cron executor drains it in bounded batches OFF this request
  // (lib/crm/send-drain.ts, RENCANA-kirim-latar). The send audit row is written by the drainer,
  // carrying the actor's email as actor_email.
  const enq = await enqueueRunDrain(createAdminClient(), runId, actor.email);
  if (!enq.ok) {
    if (enq.conflict) {
      // Lost the create→enqueue race to a concurrent send for the same (segment, template): the DB's
      // partial unique index refused this run's transition to 'sending'. Abandon this orphan and point
      // at the run already in progress — the DB, not timing, has the last word.
      await recordRunError(runId, "superseded_concurrent_run");
      const winner = await activeSendingRunFor(args.segmentId, args.templateKey);
      return { ok: false, error: "send_in_progress", runId: winner?.id, runLabel: winner?.label ?? null };
    }
    return { ok: false, error: "enqueue_failed", runId, runLabel, isNewRun };
  }

  return {
    ok: true,
    queued: true,
    drift,
    sendable: fresh.sendable,
    runId,
    runLabel,
    isNewRun,
    runStatus: "sending",
  };
}

export interface PreviewEmailResult {
  ok: boolean;
  error?: "denied" | "missing_env" | "no_template" | "send_failed";
  detail?: string;
  sentTo?: string[];
}

/**
 * Send a preview email directly — the real render + provider path, but to the given addresses only,
 * bypassing the campaign engine. Subject is prefixed [PREVIEW]; the unsubscribe link is a PREVIEW
 * token that suppresses nobody.
 */
export async function sendPreviewEmailCore(
  actor: SendActor,
  toEmails: string[],
  templateKey: string,
  sampleMergeValues?: Record<string, string>,
): Promise<PreviewEmailResult> {
  if (grantFor(actor.role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const admin = createAdminClient();
  const { data: tplData, error: tplErr } = await admin
    .from("crm_message_template")
    .select("name, subject, body, sender_name")
    .eq("template_key", templateKey)
    .eq("channel", "email")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tplErr || !tplData) return { ok: false, error: "no_template" };
  const tpl = tplData as { name: string; subject: string | null; body: string; sender_name: string | null };

  // Two-pass substitution mirroring the real send path: renderTemplate handles built-in vars,
  // then replaceMergePlaceholders handles custom merge fields from the CSV's first row.
  const previewUnsubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.20fit.id"}/unsubscribe?token=PREVIEW`;
  const sampleBuiltins = { full_name: "Budi Santoso", first_name: "Budi", city: "Jakarta", unsubscribe_url: previewUnsubUrl };
  const afterBuiltins = renderTemplate(tpl.body, sampleBuiltins);
  const substituted = sampleMergeValues
    ? replaceMergePlaceholders(afterBuiltins, sampleMergeValues)
    : afterBuiltins.replace(/\{\{([^}]+)\}\}/g, (_, key) => `[${key}]`);
  const doc = renderEmailDocument(substituted, previewUnsubUrl);
  const html = inlineEmailCss(doc.html);
  const text = doc.text;
  const rawSubject = tpl.subject ?? tpl.name;
  const subjectRendered = renderTemplate(rawSubject, sampleBuiltins);
  const subject = `[PREVIEW] ${sampleMergeValues ? replaceMergePlaceholders(subjectRendered, sampleMergeValues) : subjectRendered}`;

  const { sendTransactionalEmail } = await import("@/lib/email/send");
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const to of toEmails) {
    try {
      // T-74: the preview sends under the template's OWN sender name, so a Send-test reflects the
      // exact from.name a real campaign would use (null → client default "20FIT CRM").
      await sendTransactionalEmail({ to, subject, text, html }, "campaign-preview", tpl.sender_name ?? undefined);
      sentTo.push(to);
    } catch {
      errors.push(to);
    }
  }

  if (sentTo.length === 0) return { ok: false, error: "send_failed", detail: errors.join(", ") };
  return { ok: true, sentTo };
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

export async function scheduleCampaignCore(actor: SendActor, args: {
  segmentId: string;
  templateKey: string;
  confirmedLargeSend: boolean;
  shownSendable: number;
  runLabel: string | null;
  dateWib: string; // "YYYY-MM-DD"
  timeWib: string; // "HH:MM"
  mergeData?: MergeRow[];
}, servingHost: string | undefined): Promise<ScheduleResult> {
  const role = actor.role;
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const seg = await getSegmentById(args.segmentId);
  if (!seg) return { ok: false, error: "not_found" };
  if (seg.requiresClinical && !isPermitted(role, "profile.view_health")) return { ok: false, error: "clinical_gate" };
  if (!(await templateHasUnsubscribe(args.templateKey))) return { ok: false, error: "no_unsubscribe" };

  // Name required for a NEW scheduled send (runLabel present). A null runLabel means "resume an
  // existing run", which keeps that run's own name, so it isn't re-validated here.
  let validatedRunLabel: string | null = null;
  if (args.runLabel !== null) {
    const nameCheck = validateCampaignName(args.runLabel);
    if (!nameCheck.ok) return { ok: false, error: "label_required" };
    validatedRunLabel = nameCheck.value!;
  }

  const hostBlock = unsubscribeHostBlocked(servingHost);
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

  const createdBy = actor.email;

  const res = await insertScheduledSend(createAdminClient(), {
    segmentId: args.segmentId,
    templateKey: args.templateKey,
    runLabel: validatedRunLabel,
    scheduledAtUtc,
    confirmedLargeSend: args.confirmedLargeSend,
    shownSendable: fresh.sendable,
    createdBy,
    mergeData: args.mergeData,
  });
  if (!res.ok) return { ok: false, error: "schedule_failed" };
  return { ok: true, scheduledAtUtc };
}
