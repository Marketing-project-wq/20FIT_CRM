import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSegmentById } from "@/lib/crm/segment-store";
import { sendCampaign, resolveEmailListRecipients } from "@/lib/crm/send-campaign";
import { createRun, markRunSending, finalizeRunStatus, recordRunError } from "@/lib/crm/campaign-run";
import { classifySendThrow } from "@/lib/crm/send-env";
import { claimDueScheduledSends, markScheduledSent, markScheduledFailed } from "@/lib/crm/scheduled-send";

export const dynamic = "force-dynamic";

/**
 * Executor for scheduled campaign sends. Called by pg_cron (Supabase) every 5 minutes via pg_net.
 * Protected by a shared secret header (x-cron-secret == SCHEDULED_SEND_CRON_SECRET) — NOT a user
 * session, so the secret is the only authorization. Claims due pending rows and runs each through
 * the SAME sendCampaign path a manual send uses (suppression + pre-launch withhold + audit intact).
 * Idempotent: claimDueScheduledSends guards each row so a second cron tick won't double-send.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SCHEDULED_SEND_CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const due = await claimDueScheduledSends(admin, nowIso);

  let sent = 0, failed = 0;
  for (const s of due) {
    try {
      const seg = await getSegmentById(s.segmentId);
      if (!seg) { await markScheduledFailed(admin, s.id, "segment_not_found"); failed++; continue; }

      // Manual email-list segment: resolve to real pool uuids; refuse (with a named cause) if any
      // address is not in the pool — never create a run doomed to throw on the uuid insert.
      let emailRecipients: Awaited<ReturnType<typeof resolveEmailListRecipients>>["recipients"] | undefined;
      if (seg.stored.emailList && seg.stored.emailList.length > 0) {
        const resolved = await resolveEmailListRecipients(admin, seg.stored.emailList);
        if (resolved.unresolved.length > 0) {
          await markScheduledFailed(admin, s.id, "unresolvable_recipients");
          failed++;
          continue;
        }
        emailRecipients = resolved.recipients;
      }

      const run = await createRun({
        segmentId: s.segmentId,
        templateKey: s.templateKey,
        label: s.runLabel ?? `Terjadwal ${s.scheduledAt}`,
        createdBy: "system:scheduled-send",
      });
      if (!run) { await markScheduledFailed(admin, s.id, "run_create_failed"); failed++; continue; }

      await markRunSending(run.id);
      try {
        const result = await sendCampaign(
          {
            campaignId: run.id,
            criteria: seg.stored.criteria,
            masterFilterExpr: seg.stored.masterFilterExpr,
            templateKey: s.templateKey,
            actorId: "system:scheduled-send",
            actorEmail: "system:scheduled-send",
            confirmedLargeSend: true, // confirmed at schedule time
            ...(emailRecipients ? { overrideRecipients: emailRecipients } : {}),
          },
          new Date().toISOString(),
        );
        await finalizeRunStatus(run.id, {
          deferredDailyLimit: result.summary.deferredDailyLimit,
          stoppedHighBounce: result.summary.stoppedHighBounce,
        });
        await markScheduledSent(admin, s.id);
        sent++;
      } catch (e) {
        const cause = classifySendThrow(e);
        await recordRunError(run.id, cause);
        await markScheduledFailed(admin, s.id, cause);
        failed++;
      }
    } catch {
      await markScheduledFailed(admin, s.id, "unexpected_error");
      failed++;
    }
  }

  return NextResponse.json({ ok: true, claimed: due.length, sent, failed }, { headers: { "Cache-Control": "no-store" } });
}
