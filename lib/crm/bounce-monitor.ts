import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldStopForBounces, DEFAULT_SEND_CONFIG } from "./send-run";

/**
 * POST-SEND bounce monitor. Distinct from the IN-RUN auto-stop (runSend's shouldStopForBounces on
 * synchronous send failures): hard bounces mostly arrive LATER, via the Mailtrap webhook filling
 * crm_message_log.bounced_at. This reads those accumulated bounces and evaluates whether a campaign
 * has crossed the approved 5% hard-bounce threshold.
 *
 * ACTIVATED 31 Aug 2026 (owner decision, before the first larger campaign). `active` now reflects
 * BOUNCE_AUTOSTOP_ACTIVE; sendCampaign consults campaignBounceStatus BEFORE a run and refuses to
 * start it when `active && wouldStop`. The dataSufficient gate is what makes activation safe: a
 * threshold computed from near-zero sends behaves absurdly (1 bounce out of 3 sends = 33% would
 * "stop" a campaign that has barely started), so below minBounceSample `wouldStop` is ALWAYS false
 * regardless of ratio — a fresh campaign (0 prior attempts) can never be pre-halted. The stop only
 * bites on a RESUME after the webhook has filled ≥ minBounceSample attempts whose hard-bounce ratio
 * crossed the approved 5%.
 */

/** Whether the post-send bounce auto-stop is wired to actually halt sending. Flipping this to false
 *  reverts to measure-only (the arithmetic still runs; nothing is halted). */
export const BOUNCE_AUTOSTOP_ACTIVE = true;

export interface BounceStop {
  attempted: number;
  hardBounces: number;
  ratio: number; // 0 when attempted is 0 (not NaN) — a safe display value
  dataSufficient: boolean; // attempted >= minSample — below this, wouldStop is always false
  wouldStop: boolean; // does the 5% rule trip (already gated by dataSufficient)?
  active: boolean; // whether the auto-stop is actually wired to halt sending
  stop: boolean; // the effective decision: active && wouldStop — the one flag callers act on
}

const DEFAULT_MONITOR_CONFIG = {
  threshold: DEFAULT_SEND_CONFIG.bounceThreshold,
  minSample: DEFAULT_SEND_CONFIG.minBounceSample,
};

export function evaluateBounceStop(
  input: { hardBounces: number; attempted: number },
  config: { threshold: number; minSample: number } = DEFAULT_MONITOR_CONFIG,
  active: boolean = BOUNCE_AUTOSTOP_ACTIVE,
): BounceStop {
  const attempted = Math.max(0, input.attempted);
  const hardBounces = Math.max(0, input.hardBounces);
  const ratio = attempted > 0 ? hardBounces / attempted : 0;
  const wouldStop = shouldStopForBounces(hardBounces, attempted, config.threshold, config.minSample);
  return {
    attempted,
    hardBounces,
    ratio,
    dataSufficient: attempted >= config.minSample,
    wouldStop,
    active,
    stop: active && wouldStop, // dataSufficient is already folded into wouldStop
  };
}

/**
 * Read a campaign's post-send bounce status from crm_message_log. `attempted` = rows that actually
 * went out (any terminal delivery state), `hardBounces` = rows the provider bounced (status/cause/
 * bounced_at). Read-only; it never stops anything.
 */
export async function campaignBounceStatus(admin: SupabaseClient, campaignId: string): Promise<BounceStop> {
  const attemptedStatuses = ["sent", "delivered", "bounced", "complained", "failed"];
  const [attemptedRes, bounceRes] = await Promise.all([
    admin
      .from("crm_message_log")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", attemptedStatuses),
    admin
      .from("crm_message_log")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .not("bounced_at", "is", null),
  ]);
  return evaluateBounceStop({
    attempted: attemptedRes.count ?? 0,
    hardBounces: bounceRes.count ?? 0,
  });
}
