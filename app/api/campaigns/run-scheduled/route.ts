import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { createRun, recordRunError } from "@/lib/crm/campaign-run";
import { cronRunLabel } from "@/lib/crm/campaign-label";
import { claimDueScheduledSends, markScheduledSent, markScheduledFailed } from "@/lib/crm/scheduled-send";
import {
  enqueueRunDrain,
  claimDrainableRuns,
  drainRunOnce,
  releaseRunDrainClaim,
  DRAIN_BATCH,
  DRAIN_RUNS_PER_TICK,
} from "@/lib/crm/send-drain";

export const dynamic = "force-dynamic";

/**
 * Background send executor (P0-3). Called by pg_cron (Supabase) every 5 minutes via pg_net. Protected
 * by a shared secret header (x-cron-secret == SCHEDULED_SEND_CRON_SECRET) — NOT a user session, so the
 * secret is the only authorization.
 *
 * TWO PASSES, so no send ever runs inside the operator's HTTP request and a large run drains in
 * bounded batches across ticks:
 *
 *   PASS 1 — ENQUEUE. Due crm_scheduled_send rows become active drains: create the run, flag it
 *            drain_active, and mark the schedule 'sent' (its run now represents it in Deliveries).
 *            This pass sends NOTHING; it hands the work to the drain pass.
 *   PASS 2 — DRAIN. Claim active runs (drain_active, staleness-guarded) and send ONE bounded batch
 *            each via drainRunOnce — the SAME sendCampaign path a manual send used (withhold +
 *            suppression + audit + idempotency intact), capped at DRAIN_BATCH sends. The pass stops
 *            once it has sent a batch's worth in total, so the tick stays short; the next tick
 *            continues. Runs that pause (today's shared budget spent) drop out fast, costing no sends.
 *
 * Idempotent throughout: claimDueScheduledSends and claimDrainableRuns each guard against a second
 * tick, and the deterministic crm_message_log key is the real double-send guard even if ticks overlap.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SCHEDULED_SEND_CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // ── PASS 1 · ENQUEUE due scheduled sends as background drains ─────────────────────────────────
  const due = await claimDueScheduledSends(admin, nowIso);
  let enqueued = 0;
  let enqueueFailed = 0;
  for (const s of due) {
    try {
      const seg = await getSegmentById(s.segmentId);
      if (!seg) { await markScheduledFailed(admin, s.id, "segment_not_found"); enqueueFailed++; continue; }

      // Defence in depth: an older pending row may carry no name — cronRunLabel falls back to a human
      // default (never a raw ISO timestamp, never empty). See its docblock for why this is not a `??`.
      const run = await createRun({
        segmentId: s.segmentId,
        templateKey: s.templateKey,
        label: cronRunLabel(s.runLabel, seg.name, s.scheduledAt, "id"),
        createdBy: "system:scheduled-send",
      });
      if (!run) { await markScheduledFailed(admin, s.id, "run_create_failed"); enqueueFailed++; continue; }

      // Hand the run to the drain pass, then mark the schedule 'sent' — its run represents it now
      // (deliveries.ts drops a 'sent' schedule to avoid double-counting). Any unresolvable email-list
      // or thrown send is caught by drainRunOnce and recorded on the RUN (stopped + last_error), so
      // the failure is never silent even though the schedule row is already handed off.
      const enq = await enqueueRunDrain(admin, run.id, "system:scheduled-send");
      if (!enq.ok) {
        // The DB's partial unique index refused a second 'sending' run for this (segment, template):
        // another send to the same audience is already in progress. Abandon this run and fail the
        // schedule with a named cause instead of double-sending.
        await recordRunError(run.id, enq.conflict ? "superseded_concurrent_run" : "enqueue_failed");
        await markScheduledFailed(admin, s.id, enq.conflict ? "duplicate_active_run" : "enqueue_failed");
        enqueueFailed++;
        continue;
      }
      await markScheduledSent(admin, s.id);
      enqueued++;
    } catch {
      await markScheduledFailed(admin, s.id, "unexpected_error");
      enqueueFailed++;
    }
  }

  // ── PASS 2 · DRAIN active runs, one bounded batch each, until a batch's worth is sent ──────────
  // Claim one run at a time (never over-claim: a claimed-but-unprocessed run would sit idle until its
  // claim goes stale). Stop once this tick has sent ~one batch total, so the tick stays short; the
  // next 5-minute tick continues wherever this one left off.
  let drained = 0;
  let drainSent = 0;
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < DRAIN_RUNS_PER_TICK && drainSent < DRAIN_BATCH; i++) {
    const [run] = await claimDrainableRuns(admin, new Date().toISOString(), 1);
    if (!run) break;
    try {
      const r = await drainRunOnce(admin, run, new Date().toISOString());
      drained++;
      drainSent += r.sent;
      outcomes[r.next] = (outcomes[r.next] ?? 0) + 1;
    } catch {
      // An unexpected throw inside the drain: release the claim so a later tick retries. Idempotency
      // keeps that safe — anything already sent this batch is claim-skipped on the retry.
      await releaseRunDrainClaim(admin, run.id);
    }
  }

  return NextResponse.json(
    { ok: true, enqueued, enqueueFailed, drained, drainSent, outcomes },
    { headers: { "Cache-Control": "no-store" } },
  );
}
