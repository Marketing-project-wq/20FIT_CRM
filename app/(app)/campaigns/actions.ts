"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { listResumableRuns, type ResumableRun, type RunStatus } from "@/lib/crm/campaign-run";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { runInternalSendTest, cleanupInternalSendTest, type SendTestResult, type SendTestCleanupResult } from "@/lib/crm/send-test-harness";
import {
  previewCampaignCore,
  sendCampaignCore,
  sendPreviewEmailCore,
  scheduleCampaignCore,
  type ScheduleResult,
  unsubscribeHostBlocked,
  type SendActor,
  type SendArgs,
  type PreviewResult,
  type SendResult,
  type PreviewEmailResult,
} from "@/lib/crm/campaign-send-core";
import {
  listScheduledSends,
  cancelScheduledSend,
  type ScheduledSend,
} from "@/lib/crm/scheduled-send";

// The send path itself lives in lib/crm/campaign-send-core.ts (shared with Agent Mail's MCP route);
// these types are re-exported so the composer's imports stay where they were.
export type { PreviewResult, SendResult, PreviewEmailResult, RunChoice, ScheduleResult } from "@/lib/crm/campaign-send-core";

export type InternalTestResult = SendTestResult | { ok: false; error: "denied" };

/**
 * Campaign compose server actions. Every path re-checks the clinical gate against the USING role
 * (not the segment's creator) and refuses a template with no unsubscribe variable — both are
 * preconditions in code, not conventions.
 */

/** Serving host from the request, or undefined if unavailable. */
function servingHost(): string | undefined {
  try {
    return headers().get("host") ?? undefined;
  } catch {
    return undefined;
  }
}

/** The session's actor (role + email) for the shared send core. Identity fails open to null email —
 *  the run still drains, created_by / drain_requested_by are just null. */
async function sessionActor(): Promise<SendActor> {
  const role = await getCurrentUserRole();
  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    email = null;
  }
  return { role, email };
}

export async function previewCampaignAction(segmentId: string, templateKey: string): Promise<PreviewResult> {
  return previewCampaignCore(await sessionActor(), segmentId, templateKey);
}

/**
 * Soft duplicate-name check: has any run in the last 30 days used this exact name (case-insensitive,
 * trimmed)? Returns the most recent match's date, or null. This is a WARNING signal only — the name is
 * required but NOT unique (no DB constraint, no block). Called on blur (not per keystroke), so it is
 * one small query per name entry. Fail-open: any error returns "no duplicate" so a check failure can
 * never stop a send.
 */
export async function checkDuplicateCampaignNameAction(name: string): Promise<{ ok: boolean; usedOn?: string | null }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: true, usedOn: null };
  try {
    const admin = createAdminClient();
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Fetch the (small) 30-day window and match case-insensitively in JS — PostgREST eq is
    // case-sensitive and ilike would treat % / _ in a campaign name as wildcards.
    const { data } = await admin
      .from("crm_campaign_run")
      .select("created_at, label")
      .gte("created_at", sinceIso)
      .not("label", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const needle = trimmed.toLowerCase();
    const match = (data ?? []).find((r: { label: string | null }) => (r.label ?? "").trim().toLowerCase() === needle);
    return { ok: true, usedOn: match ? (match as { created_at: string }).created_at : null };
  } catch {
    return { ok: true, usedOn: null };
  }
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

export async function sendCampaignAction(args: SendArgs): Promise<SendResult> {
  const res = await sendCampaignCore(await sessionActor(), args, servingHost());
  if (res.ok) revalidatePath("/campaigns");
  return res;
}

export async function scheduleCampaignAction(args: Parameters<typeof scheduleCampaignCore>[1]): Promise<ScheduleResult> {
  const res = await scheduleCampaignCore(await sessionActor(), args, servingHost());
  if (res.ok) revalidatePath("/campaigns");
  return res;
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

export async function sendPreviewEmailAction(
  toEmails: string[],
  templateKey: string,
  sampleMergeValues?: Record<string, string>,
): Promise<PreviewEmailResult> {
  return sendPreviewEmailCore(await sessionActor(), toEmails, templateKey, sampleMergeValues);
}

export async function runInternalSendTestAction(quickEmail?: string): Promise<InternalTestResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  const hostBlock = unsubscribeHostBlocked(servingHost());
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
