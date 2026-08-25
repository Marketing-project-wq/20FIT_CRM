import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldStopForBounces, DEFAULT_SEND_CONFIG } from "./send-run";

/**
 * POST-SEND bounce monitor. Distinct from the IN-RUN auto-stop (runSend's shouldStopForBounces on
 * synchronous send failures): hard bounces mostly arrive LATER, via the Mailtrap webhook filling
 * crm_message_log.bounced_at. This reads those accumulated bounces and evaluates whether a campaign
 * has crossed the approved 5% hard-bounce threshold.
 *
 * NOT ACTIVATED. `active` is always false today. Building the check now is safe; ENABLING it is not,
 * until there is real bounce data — a threshold computed from near-zero sends behaves absurdly
 * (1 bounce out of 3 sends = 33% would "stop" a campaign that has barely started). `dataSufficient`
 * gates that: below the minimum sample, `wouldStop` is false regardless of ratio. When a human
 * decides to turn this on (after the webhook has filled real bounces), wiring `wouldStop` to halt a
 * campaign's future resume runs is the only remaining step — the arithmetic here is already correct.
 */

export interface BounceStop {
  attempted: number;
  hardBounces: number;
  ratio: number; // 0 when attempted is 0 (not NaN) — a safe display value
  dataSufficient: boolean; // attempted >= minSample — below this, wouldStop is always false
  wouldStop: boolean; // would the 5% rule trip IF this were active?
  active: boolean; // whether the auto-stop is actually wired to halt sending (false today)
}

const DEFAULT_MONITOR_CONFIG = {
  threshold: DEFAULT_SEND_CONFIG.bounceThreshold,
  minSample: DEFAULT_SEND_CONFIG.minBounceSample,
};

export function evaluateBounceStop(
  input: { hardBounces: number; attempted: number },
  config: { threshold: number; minSample: number } = DEFAULT_MONITOR_CONFIG,
): BounceStop {
  const attempted = Math.max(0, input.attempted);
  const hardBounces = Math.max(0, input.hardBounces);
  const ratio = attempted > 0 ? hardBounces / attempted : 0;
  return {
    attempted,
    hardBounces,
    ratio,
    dataSufficient: attempted >= config.minSample,
    wouldStop: shouldStopForBounces(hardBounces, attempted, config.threshold, config.minSample),
    active: false, // never halts today — enable only after the webhook has filled real bounces
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
