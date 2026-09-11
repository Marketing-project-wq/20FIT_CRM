import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "./segment-store";
import { sendCampaign, resolveEmailListRecipients } from "./send-campaign";
import { finalizeRunStatus, finalizeRunFromLog, markRunSending } from "./campaign-run";
import { classifySendThrow } from "./send-env";
import { getSendConfig } from "./send-config";
import { DEFAULT_SEND_CONFIG, type SendSummary } from "./send-run";
import {
  DRAIN_BATCH,
  DRAIN_CLAIM_STALE_MS,
  DRAIN_RUNS_PER_TICK,
  nextDrainState,
  type DrainNext,
} from "./send-drain-plan";

export { DRAIN_BATCH, DRAIN_CLAIM_STALE_MS, DRAIN_RUNS_PER_TICK, nextDrainState, type DrainNext };

/**
 * Background send DRAINER (P0-3, jalur kirim massal di proses latar). The manual send no longer runs
 * the engine inline in the operator's HTTP request; instead a run is flagged `drain_active` and the
 * pg_cron executor drains it in bounded BATCHES across ticks, off the browser. The engine, gate,
 * suppression, audit and idempotency are UNCHANGED — this module only decides, per batch, whether the
 * run continues, pauses, finishes or stopped, and it drives that through crm_campaign_run's drain
 * columns. The one-batch bound is `SendConfig.maxPerInvocation` (send-run.ts); the pure batch→state
 * rule lives in send-drain-plan.ts.
 *
 * RESPECTS the planDailySpread decision (send-plan.ts): a drain sends only up to TODAY's shared daily
 * budget, then PAUSES (drain_active=false, run stays 'sending') and waits for a human "Lanjutkan".
 * Cross-day auto-continue is deliberately not built here (RENCANA-kirim-latar.md).
 */

/** A run the executor may drain: the minimum it needs to reconstruct the send. */
export interface DrainableRun {
  id: string;
  segmentId: string | null;
  workflowId: string | null;
  templateKey: string;
  requestedBy: string | null;
}

const DRAIN_COLS = "id, segment_id, workflow_id, template_key, drain_requested_by";

function toDrainable(r: {
  id: string; segment_id: string | null; workflow_id: string | null;
  template_key: string; drain_requested_by: string | null;
}): DrainableRun {
  return { id: r.id, segmentId: r.segment_id, workflowId: r.workflow_id, templateKey: r.template_key, requestedBy: r.drain_requested_by };
}

/**
 * Flag a run for background draining: drain_active=true, status→'sending', claim cleared so the next
 * executor tick picks it up. Idempotent — used by the immediate-send action, by the executor when a
 * scheduled send comes due, and by the "Lanjutkan" control on a paused run. Best-effort status side is
 * fine (the log rows are the source of truth), but the drain flag write must succeed or the caller
 * learns nothing happened.
 */
export async function enqueueRunDrain(
  admin: SupabaseClient,
  runId: string,
  requestedBy: string | null,
): Promise<{ ok: boolean; conflict: boolean }> {
  const { error } = await admin
    .from("crm_campaign_run")
    .update({ drain_active: true, drain_claimed_at: null, drain_requested_by: requestedBy, status: "sending" })
    .eq("id", runId);
  if (!error) return { ok: true, conflict: false };
  // 23505 = the partial unique index crm_campaign_run_one_active_per_pair: another run for this
  // (segment, template) is ALREADY 'sending' — the DB refused a second concurrent send to the same
  // audience. This is NOT a generic failure; the caller reports send_in_progress and abandons the
  // orphan run. (A resume is the SAME row transitioning to 'sending', which never self-conflicts.)
  if ((error as { code?: string }).code === "23505") return { ok: false, conflict: true };
  return { ok: false, conflict: false };
}

/** Stop draining a run (paused / done / stopped / operator "Hentikan"): clear the flag + claim. The
 *  run's STATUS is set separately by the caller (finalize / stay 'sending'). */
export async function clearRunDrain(admin: SupabaseClient, runId: string): Promise<void> {
  await admin.from("crm_campaign_run").update({ drain_active: false, drain_claimed_at: null }).eq("id", runId);
}

/** A run's drain-relevant shape, or null if it can't be read (fail-safe: the caller refuses). */
async function loadRunForControl(
  admin: SupabaseClient,
  runId: string,
): Promise<{ status: string; drainActive: boolean; isCampaign: boolean } | null> {
  // Capture `error`: a failed read must refuse the control action, never act on a phantom row.
  const { data, error } = await admin
    .from("crm_campaign_run")
    .select("status, drain_active, segment_id, workflow_id")
    .eq("id", runId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as { status: string; drain_active: boolean; segment_id: string | null; workflow_id: string | null };
  return { status: r.status, drainActive: r.drain_active, isCampaign: !r.workflow_id && !!r.segment_id };
}

/**
 * Operator "Lanjutkan" on a PAUSED run: re-arm the background drain for the next tick. Guarded on the
 * server (never trusting the client): only a segment-owned run at status 'sending' with the drain
 * currently OFF may be resumed — so a finished/stopped run can't be revived and an automated workflow
 * run can't be pushed through the manual drainer. Idempotent-ish: resuming an already-draining run is
 * refused (there is nothing to resume).
 */
export async function resumeRunDrain(
  admin: SupabaseClient,
  runId: string,
  requestedBy: string | null,
): Promise<{ ok: boolean }> {
  const run = await loadRunForControl(admin, runId);
  if (!run || !run.isCampaign || run.status !== "sending" || run.drainActive) return { ok: false };
  return enqueueRunDrain(admin, runId, requestedBy);
}

/**
 * Operator "Hentikan" on a draining or paused run: halt it — clear the drain flag AND mark the run
 * 'stopped' with a reason, so it is never picked up again and reads honestly. Only a segment-owned
 * 'sending' run may be stopped (a terminal run is already finished). A batch that happens to be
 * in-flight finishes its current send (idempotency-safe) but, because drain_active is now false and no
 * drainRunOnce path ever SETS it true, the run is not drained again.
 */
export async function stopRunDrain(admin: SupabaseClient, runId: string): Promise<{ ok: boolean }> {
  const run = await loadRunForControl(admin, runId);
  if (!run || !run.isCampaign || run.status !== "sending") return { ok: false };
  const { error } = await admin
    .from("crm_campaign_run")
    .update({ drain_active: false, drain_claimed_at: null, status: "stopped", last_error: "operator_stopped" })
    .eq("id", runId);
  return { ok: !error };
}

/** Release only the CLAIM (keep drain_active) so the next tick continues this run — used after a
 *  'continue' outcome. */
export async function releaseRunDrainClaim(admin: SupabaseClient, runId: string): Promise<void> {
  await admin.from("crm_campaign_run").update({ drain_claimed_at: null }).eq("id", runId);
}

/**
 * Claim up to `limit` runs that are due to drain: drain_active AND (never claimed OR the claim went
 * stale). Each is claimed with a guarded UPDATE (only the tick that flips drain_claimed_at proceeds),
 * so two overlapping ticks never both drive the same run. Returns the claimed runs.
 */
export async function claimDrainableRuns(
  admin: SupabaseClient,
  nowIso: string,
  limit = DRAIN_RUNS_PER_TICK,
): Promise<DrainableRun[]> {
  const staleCutoff = new Date(new Date(nowIso).getTime() - DRAIN_CLAIM_STALE_MS).toISOString();
  // Capture `error`: a failed candidate read must NOT read as "no runs to drain" (the T-69 class). On
  // error, drain nothing this tick — fail-safe, the next tick retries — never a silent empty.
  const { data: candidates, error: candErr } = await admin
    .from("crm_campaign_run")
    .select("id, drain_claimed_at")
    .eq("drain_active", true)
    .order("created_at", { ascending: true })
    .limit(limit * 4); // over-fetch: some candidates may be freshly claimed by another tick
  if (candErr) return [];
  const due = ((candidates ?? []) as { id: string; drain_claimed_at: string | null }[])
    .filter((c) => c.drain_claimed_at == null || c.drain_claimed_at < staleCutoff);

  const claimed: DrainableRun[] = [];
  for (const c of due) {
    if (claimed.length >= limit) break;
    // Guarded claim by OPTIMISTIC CONCURRENCY on the exact claim value we just read: for a never-claimed
    // run guard drain_claimed_at IS NULL; for a stale one guard it still equals the stale timestamp we
    // saw. Only the tick whose guard still holds flips the row and gets it back, so two overlapping
    // ticks never both drive the same run. (Deliberately NOT a PostgREST `.or()` with an interpolated
    // timestamp — that fragile filter, if it ever errored, would silently stall ALL draining. This is
    // two plain equality guards, and idempotency on crm_message_log is the real double-send guard.)
    let q = admin.from("crm_campaign_run").update({ drain_claimed_at: nowIso }).eq("id", c.id).eq("drain_active", true);
    q = c.drain_claimed_at == null ? q.is("drain_claimed_at", null) : q.eq("drain_claimed_at", c.drain_claimed_at);
    const { data, error } = await q.select(DRAIN_COLS).maybeSingle();
    if (!error && data) claimed.push(toDrainable(data as Parameters<typeof toDrainable>[0]));
  }
  return claimed;
}

export interface DrainOnceResult {
  next: DrainNext | "error";
  sent: number;
  detail?: string; // on error / unresolvable: a PII-free cause
}

/**
 * Drain ONE batch of a run and set its next drain state. Runs the SAME sendCampaign path a manual
 * send used — pre-launch withhold, suppression-at-send, audit, idempotency all intact — but capped at
 * DRAIN_BATCH sends via maxPerInvocation, so the tick is bounded. The daily ceiling is read live from
 * the log inside the engine, so competing drains share it correctly.
 */
export async function drainRunOnce(
  admin: SupabaseClient,
  run: DrainableRun,
  nowIso: string,
): Promise<DrainOnceResult> {
  // A workflow-owned run is driven by the workflow path, never the drainer; refuse defensively so a
  // stray flag can't send an automated run through the manual engine. Clear the flag and stop.
  if (!run.segmentId || run.workflowId) {
    await clearRunDrain(admin, run.id);
    return { next: "error", sent: 0, detail: "not_a_campaign_run" };
  }

  const seg = await getSegmentById(run.segmentId);
  if (!seg) {
    await clearRunDrain(admin, run.id);
    await markStoppedWithReason(admin, run.id, "segment_not_found");
    return { next: "error", sent: 0, detail: "segment_not_found" };
  }

  // Manual email-list segment → resolve to real pool uuids; refuse (named) if any address is not in
  // the pool, exactly as the immediate + scheduled paths do — never drive a doomed send.
  let emailRecipients: Awaited<ReturnType<typeof resolveEmailListRecipients>>["recipients"] | undefined;
  if (seg.stored.emailList && seg.stored.emailList.length > 0) {
    const resolved = await resolveEmailListRecipients(admin, seg.stored.emailList);
    if (resolved.unresolved.length > 0) {
      await clearRunDrain(admin, run.id);
      await markStoppedWithReason(admin, run.id, "unresolvable_recipients");
      return { next: "error", sent: 0, detail: "unresolvable_recipients" };
    }
    emailRecipients = resolved.recipients;
  }

  const { dailyLimit } = await getSendConfig(admin);
  let summary: SendSummary;
  try {
    const result = await sendCampaign(
      {
        campaignId: run.id,
        criteria: seg.stored.criteria,
        masterFilterExpr: seg.stored.masterFilterExpr,
        templateKey: run.templateKey,
        actorId: "system:drain",
        actorEmail: run.requestedBy,
        confirmedLargeSend: true, // confirmed when the operator pressed send / scheduled
        config: { ...DEFAULT_SEND_CONFIG, dailyLimit, maxPerInvocation: DRAIN_BATCH },
        ...(emailRecipients ? { overrideRecipients: emailRecipients } : {}),
      },
      nowIso,
    );
    summary = result.summary;
  } catch (e) {
    // A thrown send (e.g. a required secret is unset): stop the drain, record WHY on the run — never a
    // silent flag left spinning (T-30). The executor keeps going with the other runs.
    const cause = classifySendThrow(e);
    await clearRunDrain(admin, run.id);
    await markStoppedWithReason(admin, run.id, cause);
    return { next: "error", sent: 0, detail: cause };
  }

  const next = nextDrainState(summary);
  switch (next) {
    case "continue":
      // More to send RIGHT NOW → keep 'sending' (never finalize — that would file it 'sent' early) and
      // release the claim so the next tick continues.
      await markRunSending(run.id);
      await releaseRunDrainClaim(admin, run.id);
      break;
    case "paused_daily_limit":
      // A finite ceiling was configured and today's share is spent. The run stays 'sending' and the
      // drain stays ARMED — the next tick re-reads the ceiling from the log and continues the moment
      // there is room (i.e. after WIB midnight), with no human in the loop.
      //
      // CHANGED 11 Sep 2026: this used to clear drain_active and wait for an operator to click
      // "Lanjutkan", which is what made a large campaign take one calendar day and one click per
      // 1,000 recipients. With the ceiling now UNLIMITED by default this branch is unreachable in
      // normal operation; it only runs if an operator deliberately sets a finite limit in Settings,
      // and even then it costs a wait for the clock, never a wait for a person.
      await markRunSending(run.id);
      await releaseRunDrainClaim(admin, run.id);
      break;
    case "stopped":
      // Bounce ratio / consecutive-failure wall — finalizeRunStatus records the reason from the
      // stopping batch's summary (same contract as an inline stop), then clear the flag.
      await finalizeRunStatus(run.id, summary);
      await clearRunDrain(admin, run.id);
      break;
    case "done": {
      // Everything left was handled → TERMINAL status from the WHOLE run log, not this one batch: a
      // run whose failures were in an EARLIER batch must land 'partial'/'failed', never 'sent' (T-42
      // invariant on the latar path). Falls back to the last-batch summary only if the whole-log count
      // read fails, so 'done' always reaches a terminal status.
      const fromLog = await finalizeRunFromLog(admin, run.id);
      if (fromLog == null) await finalizeRunStatus(run.id, summary);
      await clearRunDrain(admin, run.id);
      break;
    }
  }
  return { next, sent: summary.sent };
}

/** Record a stopped drain's reason on the run (status 'stopped' + last_error). Kept here rather than
 *  reusing recordRunError so a caller reading this file sees the whole drain lifecycle in one place;
 *  the write is the same shape. */
async function markStoppedWithReason(admin: SupabaseClient, runId: string, reason: string): Promise<void> {
  await admin.from("crm_campaign_run").update({ status: "stopped", last_error: reason.slice(0, 200) }).eq("id", runId);
}

/** Convenience for callers that only have a runId (immediate-send action, "Lanjutkan" control). */
export async function enqueueRunDrainById(runId: string, requestedBy: string | null): Promise<{ ok: boolean }> {
  return enqueueRunDrain(createAdminClient(), runId, requestedBy);
}
