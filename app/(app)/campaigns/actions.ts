"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { isPermitted, grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { previewCampaign, sendCampaign } from "@/lib/crm/send-campaign";
import { describeCountDrift, planDailySpread, type CountDrift, type DailySpread } from "@/lib/crm/send-plan";
import { DEFAULT_SEND_CONFIG, requiresLargeSendConfirmation, type SendSummary } from "@/lib/crm/send-run";
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

export interface SendResult {
  ok: boolean;
  error?: "denied" | "not_found" | "clinical_gate" | "no_unsubscribe" | "needs_confirm" | "count_changed";
  drift?: CountDrift; // recount at confirm vs what the operator saw
  freshSendable?: number; // the recounted number to show + re-press against (on count_changed)
  summary?: SendSummary;
  withheldPrelaunch?: number;
  realSend?: boolean;
}

export async function sendCampaignAction(args: {
  segmentId: string;
  templateKey: string;
  confirmedLargeSend: boolean;
  shownSendable: number; // the number the operator saw when they pressed send
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
  // return the fresh number so the form can say so and require a second press against it.
  if (drift.changed) {
    return { ok: false, error: "count_changed", drift, freshSendable: fresh.sendable };
  }

  if (requiresLargeSendConfirmation(fresh.sendable) && !args.confirmedLargeSend) {
    return { ok: false, error: "needs_confirm", drift };
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
  // Deterministic campaign id per (segment, template): a re-run RESUMES (idempotency skips already
  // sent) rather than re-sending — this is what lets a segment larger than the daily quota finish
  // across days by manual re-run.
  const campaignId = `${args.segmentId}:${args.templateKey}`;

  const result = await sendCampaign(
    {
      campaignId,
      criteria: seg.stored.criteria,
      masterFilterExpr: seg.stored.masterFilterExpr,
      templateKey: args.templateKey,
      actorId,
      actorEmail,
      confirmedLargeSend: args.confirmedLargeSend,
    },
    stamp,
  );

  return {
    ok: true,
    drift,
    summary: result.summary,
    withheldPrelaunch: result.withheldPrelaunch,
    realSend: result.realSend,
  };
}
