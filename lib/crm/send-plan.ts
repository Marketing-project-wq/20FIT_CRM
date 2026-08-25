/**
 * Pure planning helpers for the campaign compose form (TUGAS 2). No I/O — so the two things that
 * "only appear once the form is real" are decided in tested code, not in the UI by hand.
 */

/**
 * COUNT DRIFT. The recipient count shown when the form opened can be stale by the time the operator
 * confirms (they read, hesitate, switch template). We recompute at confirm; if it differs, the form
 * must SAY SO before sending — a silent gap between "1,204 recipients" seen and the number actually
 * sent is what makes people stop trusting the screen.
 */
export interface CountDrift {
  changed: boolean;
  shown: number;
  fresh: number;
  delta: number; // fresh - shown (negative = fewer than shown, e.g. more suppressed since)
}

export function describeCountDrift(shown: number, fresh: number): CountDrift {
  return { changed: shown !== fresh, shown, fresh, delta: fresh - shown };
}

/**
 * DAILY SPREAD. A 5,000-recipient segment under a 1,000/day limit cannot finish today. The form must
 * say — BEFORE send — how many days it will take, rather than sending 1,000 and stopping without
 * explanation. `remainingToday` is the leftover of today's budget (dailyLimit − already sent today),
 * read from crm_message_log by the caller.
 *
 * DECISION (argued in the campaign doc): the leftover is NOT auto-continued tomorrow. It waits for a
 * human to re-run the same campaign. Auto-continue would need a scheduler AND a domain-reputation
 * ramp (RENCANA-batas-kirim's ramp is a recommendation, not built), and silently sending across days
 * with no human check is exactly how a young domain's reputation gets burned. Manual re-run is
 * explicit and SAFE: the deterministic idempotency key means a re-run skips everyone already sent.
 */
export interface DailySpread {
  recipientCount: number;
  sentToday: number; // how many go out in this run
  leftover: number; // how many wait for a later run
  daysNeeded: number; // calendar days to finish at the daily limit
  exceedsToday: boolean; // true → the form must disclose the multi-day span before send
}

export function planDailySpread(
  recipientCount: number,
  remainingToday: number,
  dailyLimit: number,
): DailySpread {
  const cap = Math.max(0, remainingToday);
  const total = Math.max(0, recipientCount);
  const sentToday = Math.min(total, cap);
  const leftover = total - sentToday;
  const perDay = Math.max(1, dailyLimit); // guard against a 0/negative limit
  const daysNeeded = (sentToday > 0 ? 1 : 0) + Math.ceil(leftover / perDay);
  return { recipientCount: total, sentToday, leftover, daysNeeded, exceedsToday: leftover > 0 };
}
