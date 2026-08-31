/**
 * Send-limit rules — PURE and client-safe (the Settings form and the server action both import
 * them, so the two can't disagree about what a valid limit is). No I/O here.
 *
 * The daily limit is a domain-REPUTATION ceiling, not a Mailtrap quota: 20fit.id has a
 * transactional history but ZERO mass-marketing history, and a sudden volume spike is the single
 * strongest spam signal at Gmail/Yahoo. So the limit is configurable (the owner may raise it) but a
 * large jump earns a one-time WARNING — never a block.
 */

export const DAILY_LIMIT_DEFAULT = 1000;
export const WORKFLOW_DAILY_CAP_DEFAULT = 300;

export interface SendLimits {
  dailyLimit: number;
  workflowDailyCap: number;
}

export const DEFAULT_SEND_LIMITS: SendLimits = {
  dailyLimit: DAILY_LIMIT_DEFAULT,
  workflowDailyCap: WORKFLOW_DAILY_CAP_DEFAULT,
};

/** A limit must be a positive whole number; the workflow sub-cap must not exceed the daily limit
 *  (a sub-cap larger than the whole is meaningless). Returns a named reason on failure. */
export function validateSendLimits(input: { dailyLimit: number; workflowDailyCap: number }): { ok: boolean; error?: string } {
  const { dailyLimit, workflowDailyCap } = input;
  if (!Number.isInteger(dailyLimit) || dailyLimit <= 0) return { ok: false, error: "daily_invalid" };
  if (!Number.isInteger(workflowDailyCap) || workflowDailyCap <= 0) return { ok: false, error: "workflow_invalid" };
  if (workflowDailyCap > dailyLimit) return { ok: false, error: "cap_over_limit" };
  return { ok: true };
}

/** A "large raise" = more than DOUBLING the previous daily limit. Used to decide whether to show the
 *  reputation warning once. A raise the owner has already seen the warning for (or a decrease) does
 *  not warn again. Pure so the form and the server can agree on when the warning fires. */
export function isLargeRaise(previous: number, next: number): boolean {
  if (!Number.isFinite(previous) || previous <= 0) return next > DAILY_LIMIT_DEFAULT * 2;
  return next > previous * 2;
}

/** The recommended domain-warmup ramp (a SUGGESTION shown on screen, never enforced). Each step
 *  holds ~2 days; raise only once bounce + complaints stay under threshold. */
export const RAMP_STEPS: readonly number[] = [200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 82000];
