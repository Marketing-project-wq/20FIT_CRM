/**
 * Manual campaign send engine (contacting-half, send path — TUGAS 2). The CORE is pure and driven
 * through injected ports, so every binding rule is provable in a unit test — including resume after
 * a REAL interruption (run a partial list, then re-run the full list; nobody is sent twice). The
 * server wiring (Supabase claim/record, Mailtrap send, suppression read) lives in the thin adapter
 * lib/crm/send-campaign.ts; NOTHING here does I/O directly.
 *
 * THE BINDING RULES, each enforced here and tested in send-run.test.ts:
 *   1. Suppression is checked AT SEND (per recipient, immediately before claiming), NOT when the
 *      segment was counted — an unsubscribe that arrives between "count this morning" and "send this
 *      afternoon" is honoured. A suppressed recipient is recorded `skipped_suppressed`, never sent
 *      and never silently dropped (the skipped COUNT is a number staff must see).
 *   2. Idempotency survives interruption. The key is DETERMINISTIC (buildIdempotencyKey) so re-running
 *      regenerates the same keys; claim() is INSERT-if-absent, so an already-claimed recipient is
 *      skipped. A 10k run cut off at 6k re-sends only the last 4k on resume.
 *   3. The daily limit is counted FROM THE LOG (ports.todaySentCount), never a separate counter that
 *      could drift. Over-limit recipients are DEFERRED (left unclaimed for a later run), not failed.
 *   4. Every message MUST carry the signed unsubscribe link. assertHasUnsubscribeLink runs BEFORE the
 *      claim; if a rendered body lacks it the whole run aborts before anything is sent — a campaign
 *      email without the link cannot be sent at all (a hard precondition, not a convention).
 *   5. A per-recipient failure does NOT stop the rest, but is recorded with a DIFFERENTIATED cause
 *      (invalid_address / hard_bounce / provider_rejected / unknown). Collapsing them into one status
 *      is exactly what hid the reset bug for days — so the cause is a first-class column.
 *   6. Hard-bounce auto-stop at the approved 5% threshold: a run that is bouncing badly stops itself
 *      (stoppedHighBounce) rather than burning the domain's reputation to the end of the list.
 *   7. Consecutive-failure auto-stop at 20: a run that is failing on EVERY recipient in a row has hit
 *      a wall (provider down, credential dead, quota gone), not 20 bad addresses. It stops itself
 *      (stoppedConsecutiveFailures) instead of writing the rest of the list as failures.
 */

import { safeCode } from "./safe-code";
import type { IdentityKind } from "./suppression-input";

export type Channel = "email" | "whatsapp";

/** The differentiated send-failure causes (rule 5). `unknown` is the honest bucket for an
 *  unclassifiable error — it is still recorded distinctly, never silently merged into a success.
 *
 *  `provider_throttled` (429 / 402 / 503) is deliberately SEPARATE from `provider_rejected`: those
 *  statuses mean the provider is throttling / cutting off US (rate limit, quota or capacity), they
 *  say NOTHING about the recipient. Folding them into `provider_rejected` would make our own
 *  throttling read as a recipient problem and would poison any future bounce/suppression decision
 *  built on these counts. `provider_rejected` stays what it says: a recipient-level 4xx. */
export type SendFailureCause =
  | "invalid_address"
  | "hard_bounce"
  | "provider_rejected"
  | "provider_throttled"
  | "unknown";

export const SEND_FAILURE_CAUSES: readonly SendFailureCause[] = [
  "invalid_address",
  "hard_bounce",
  "provider_rejected",
  "provider_throttled",
  "unknown",
];

/** HTTP statuses that mean "the provider is throttling us", not "this recipient is bad".
 *  429 too many requests · 402 payment/quota exhausted · 503 service unavailable. */
export const THROTTLE_STATUSES: readonly number[] = [429, 402, 503];

/** Above this many recipients the send UI must show a SECOND confirmation (RENCANA-batas-kirim):
 *  not a quota — a guard against choosing "everyone" and hitting send without seeing the scale. */
export const LARGE_SEND_CONFIRM_THRESHOLD = 500;

export function requiresLargeSendConfirmation(recipientCount: number): boolean {
  return recipientCount > LARGE_SEND_CONFIRM_THRESHOLD;
}

export interface SendConfig {
  /** System daily ceiling (RENCANA-batas-kirim default 1000; configurable). */
  dailyLimit: number;
  /** Hard-bounce fraction that auto-stops the run (owner-approved 0.05, 24 Aug). */
  bounceThreshold: number;
  /** Don't auto-stop before this many attempts — a tiny run shouldn't stop on one bounce. */
  minBounceSample: number;
  /** Consecutive failures that halt the run (rule 7). A wall — the provider refusing every request —
   *  is not a per-recipient problem, so continuing only writes tens of thousands of identical
   *  failures. Owner-approved 20, deliberately level with minBounceSample. */
  maxConsecutiveFailures: number;
  /** Rule 8 (BACKOFF, 8 Sep 2026). Max send ATTEMPTS per recipient before it is finally recorded as
   *  failed. 4 attempts ⇒ up to 3 backoff waits (1s, 2s, 4s jittered) — see backoffDelayMs. Only
   *  RETRYABLE errors (provider throttle / network) consume an attempt; a recipient-level rejection
   *  fails on the first try. */
  maxSendAttempts: number;
  /** Base for the exponential backoff, in ms. Wait before retry N = base·2^(N-1), then jittered. */
  backoffBaseMs: number;
  /** Rule 9 (PACING, 8 Sep 2026). A base pause after EVERY real send attempt, success or failure —
   *  independent of any error. Sending 2.8/s without a break for 108 min is the behaviour that
   *  provoked the 3 Sep wall (a hypothesis — the reject status was discarded; see TEMUAN.md). At
   *  500 ms a run is capped near 2 sends/s; a full 1,000-send day takes ≈ 8–9 min instead of ≈ 6. */
  interRecipientDelayMs: number;
  /** BATCH CAP (P0-3, background drainer). The most send ATTEMPTS one runSend invocation may claim
   *  before it stops and reports `haltedForBatch`. It bounds a single tick's DURATION so a background
   *  executor can drain a large run across many short ticks (never one multi-hour HTTP request), while
   *  the daily budget still bounds the DAY. Only send attempts count against it — suppressed,
   *  already-sent and daily-deferred recipients are cheap and pass through freely. Default is
   *  effectively unlimited (Number.MAX_SAFE_INTEGER) so the synchronous send paths (internal test,
   *  workflow) are unchanged; only the drainer sets it to DRAIN_BATCH. */
  maxPerInvocation: number;
}

export const DEFAULT_SEND_CONFIG: SendConfig = {
  dailyLimit: 1000,
  bounceThreshold: 0.05,
  minBounceSample: 20,
  maxConsecutiveFailures: 20,
  maxSendAttempts: 4,
  backoffBaseMs: 1000,
  interRecipientDelayMs: 500,
  maxPerInvocation: Number.MAX_SAFE_INTEGER, // no batch cap by default; only the drainer lowers it
};

/**
 * Which thrown send errors are worth RETRYING the SAME recipient for (rule 8). Two kinds, and only
 * two:
 *   1. The provider throttling US — a THROTTLE_STATUS (429/402/503). Retrying after a pause is the
 *      whole point: on 3 Sep the provider accepted 124 then refused 18,119 with no pause between.
 *   2. A network-level throw with NO HTTP status — ECONNRESET/ETIMEDOUT/ENOTFOUND/… or fetch's bare
 *      "fetch failed" TypeError. The request never reached a verdict; a retry is honest.
 * Everything WITH a non-throttle HTTP status is a RECIPIENT-level answer (invalid address, hard
 * bounce, 4xx rejection) — retrying it just repeats the same rejection, so it fails on attempt 1.
 */
export function isRetryableSendError(err: unknown): boolean {
  const e = (err ?? {}) as { status?: unknown; code?: unknown; cause?: { code?: unknown } | null; message?: unknown };
  if (typeof e.status === "number" && Number.isFinite(e.status)) {
    return THROTTLE_STATUSES.includes(e.status); // a status present but non-throttle ⇒ recipient-level ⇒ no retry
  }
  const codeStr = String((e.cause?.code ?? e.code) ?? "").toUpperCase();
  if (codeStr && ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EPIPE", "UND_ERR"].some((c) => codeStr.includes(c))) {
    return true;
  }
  const msg = String(e.message ?? "").toLowerCase();
  return msg.includes("fetch failed") || msg.includes("network");
}

/**
 * Backoff wait (ms) before the retry that FOLLOWS a failed attempt number `attempt` (1-based). Base
 * doubles each time — 1s, 2s, 4s at backoffBaseMs=1000 — with EQUAL JITTER: half fixed, half random
 * in [0, half]. Jitter spreads retries so a fleet of recipients throttled at once do not all retry
 * on the same tick and reproduce the burst. `rng` is injected so tests are deterministic (rng=()=>0
 * ⇒ the minimum, half the base). The final attempt has no wait after it — 4 attempts ⇒ 3 waits.
 */
export function backoffDelayMs(attempt: number, config: SendConfig, rng: () => number = Math.random): number {
  const full = config.backoffBaseMs * 2 ** (attempt - 1);
  const half = full / 2;
  return Math.round(half + rng() * half);
}

export interface SendRecipient {
  customerId: string;
  channel: Channel;
  identityKind: IdentityKind;
  /** Normalized destination (email/phone). Used to SEND and to HASH; never logged raw. */
  destination: string;
  language: "id" | "en";
}

export interface RenderedMessage {
  subject: string | null;
  text: string;
  html: string;
  /** The signed unsubscribe URL that MUST appear in both bodies (rule 4). */
  unsubscribeUrl: string;
  templateKey: string;
  templateVersion: number;
}

/** Metadata the adapter records with a claim (all non-PII except identity_hash, which is a keyed
 *  hash, not readable contact). */
export interface ClaimMeta {
  customerId: string;
  channel: Channel;
  identityHash: string;
  language: "id" | "en";
  campaignId: string;
}

export interface RecordSent {
  status: "sent";
  providerMessageId: string | null;
}
export interface RecordFailed {
  status: "failed" | "bounced";
  failureCause: SendFailureCause;
  /** PII-free scalar (HTTP status / provider code) only — never the address or the body. */
  code?: string | number | null;
}
export interface RecordSkipped {
  status: "skipped_suppressed";
}
export type RecordOutcome = RecordSent | RecordFailed | RecordSkipped;

/**
 * The ports the engine drives. Every method is async and side-effecting in production; in the test
 * they are backed by an in-memory store so a "real interruption" is just a partial call.
 */
export interface SendPorts {
  /** Rule 1: suppression checked at send. */
  isSuppressed(customerId: string, channel: Channel): Promise<boolean>;
  /** Rule 2: INSERT-if-absent by the deterministic key. Returns true only when THIS call created the
   *  row (proceed to send); false when a row already exists (skip — already handled/claimed). */
  claim(idempotencyKey: string, meta: ClaimMeta): Promise<boolean>;
  /** Personalize the message for this recipient (subject/body + the recipient's signed unsub URL). */
  render(recipient: SendRecipient): Promise<RenderedMessage>;
  /** Send it. Resolves with the provider id, or THROWS on a delivery failure (classified below). */
  send(recipient: SendRecipient, message: RenderedMessage): Promise<{ providerMessageId: string | null }>;
  /** Stamp the outcome onto the claimed row. */
  record(idempotencyKey: string, outcome: RecordOutcome): Promise<void>;
  /** Rule 3: today's already-sent count, read FROM THE LOG. */
  todaySentCount(): Promise<number>;
  /** Rules 8 & 9: pause execution `ms` milliseconds. A PORT (not a bare setTimeout) so backoff and
   *  pacing are provable in a unit test with zero real waiting — the fake records the calls. */
  sleep(ms: number): Promise<void>;
}

export interface SendSummary {
  attempted: number; // rows we actually tried to send (claimed + not suppressed + within budget)
  sent: number;
  skippedSuppressed: number;
  skippedAlreadySent: number; // idempotency: a prior run already handled these
  failed: Record<SendFailureCause, number>;
  deferredDailyLimit: number; // over today's budget → left for a later run (NOT failed)
  stoppedHighBounce: boolean;
  /** Rule 7: the run halted itself after `maxConsecutiveFailures` failures in a row. */
  stoppedConsecutiveFailures: boolean;
  /** Rule 8: how many retry waits the backoff performed across the whole run. A run with a healthy
   *  provider is 0; a non-zero value is the signal that would have made the 3 Sep throttling visible
   *  the same day instead of hiding as 18k identical failures. */
  retriedSends: number;
  /** BATCH CAP (P0-3). true → this invocation stopped because it reached `maxPerInvocation` send
   *  attempts while recipients still remained — i.e. there is MORE of this run to send RIGHT NOW,
   *  and the background drainer should continue on the next tick. Distinct from `deferredDailyLimit`
   *  (which means today's shared budget is spent, so the rest waits for TOMORROW / a human resume).
   *  false whenever the loop finished on its own — whether drained, daily-deferred, or auto-stopped. */
  haltedForBatch: boolean;
}

/** The cause with the most failures, or null when there were none. Used to label a halted run with
 *  the reason that dominated it — a class name we defined, never provider text. Ties resolve by the
 *  declared order of SEND_FAILURE_CAUSES, so the answer is deterministic. */
export function dominantFailureCause(
  failed: Record<SendFailureCause, number>,
): SendFailureCause | null {
  let best: SendFailureCause | null = null;
  let bestN = 0;
  for (const cause of SEND_FAILURE_CAUSES) {
    const n = failed[cause] ?? 0;
    if (n > bestN) {
      best = cause;
      bestN = n;
    }
  }
  return best;
}

/** Total failures across every cause — the single number a run's status and the operator's failure
 *  block are decided on. One place, so a new cause can never be forgotten by a caller that hand-adds
 *  four fields (which is exactly how `nextRunStatus` came to never see failures at all, T-42). */
export function totalFailed(failed: Record<SendFailureCause, number>): number {
  let n = 0;
  for (const cause of SEND_FAILURE_CAUSES) n += failed[cause] ?? 0;
  return n;
}

/** DETERMINISTIC idempotency key — a pure function of (campaign, recipient, channel). Documented in
 *  the crm_message_log.idempotency_key column comment. Re-running a campaign regenerates identical
 *  keys, so the unique index skips everyone already sent. NEVER add per-attempt entropy here. */
export function buildIdempotencyKey(args: {
  campaignId: string;
  customerId: string;
  channel: Channel;
}): string {
  return `${args.campaignId}:${args.customerId}:${args.channel}`;
}

/**
 * Classify a thrown send failure into one of the causes (rule 5). Best-effort from an HTTP status /
 * provider code / message; the default is `unknown` — recorded distinctly, never hidden.
 *
 * ORDER MATTERS. Since T-41 gave the mailer an `err.status`, the throttle check runs FIRST:
 *   1. 429/402/503 → provider_throttled — the provider is throttling US, whatever the prose says.
 *   2. the recipient-level keyword branches (invalid address / hard bounce / rejection).
 *   3. any remaining status ≥ 400 → provider_rejected — this is where a bare 4xx or 5xx lands, and
 *      it is what stopped 18,119 status-bearing failures from being filed as `unknown`.
 *   4. otherwise `unknown` — e.g. a network throw, whose code sendFailureCode still records.
 *
 * WHY THE KEYWORDS STAY ABOVE THE GENERIC STATUS FALLBACK (step 2 before step 3): a 422 that also
 * says "invalid email address" is a MORE specific answer than "the provider rejected it", and rule 5
 * exists to keep those apart. Our own mailer never puts provider prose in the message (it could echo
 * the address), so for its errors steps 2 and 3 cannot disagree — the refinement only bites on an
 * error that genuinely carries recipient-level text. Step 1 is exempt and absolute: throttling must
 * never be re-read as a recipient problem no matter what words come with it.
 */
export function classifySendFailure(err: unknown): SendFailureCause {
  const e = (err ?? {}) as { status?: number; code?: string | number; message?: string };
  const status = typeof e.status === "number" ? e.status : undefined;
  const code = String(e.code ?? "").toLowerCase();
  const msg = String(e.message ?? "").toLowerCase();
  const hay = `${code} ${msg}`;

  if (status !== undefined && THROTTLE_STATUSES.includes(status)) return "provider_throttled";

  // A malformed / non-existent address (syntactic or "mailbox does not exist").
  if (
    hay.includes("invalid") &&
    (hay.includes("address") || hay.includes("email") || hay.includes("recipient"))
  ) {
    return "invalid_address";
  }
  if (hay.includes("does not exist") || hay.includes("no such") || hay.includes("mailbox unavailable")) {
    return "invalid_address";
  }
  // A hard bounce — the mailbox rejected permanently.
  if (hay.includes("hard bounce") || hay.includes("bounced") || hay.includes("permanent") || hay.includes("550")) {
    return "hard_bounce";
  }
  // The provider itself rejected the request (auth, throttle, blocked sender, 4xx/5xx from the API).
  if (hay.includes("rejected") || hay.includes("forbidden") || hay.includes("blocked") || hay.includes("spam")) {
    return "provider_rejected";
  }
  if (status !== undefined && status >= 400) return "provider_rejected";
  return "unknown";
}

/**
 * The PII-free code recorded for a failed send. In priority order:
 *   1. `err.status` — the HTTP status our mailer now attaches (T-41).
 *   2. `err.cause.code` — a fetch/undici network throw's `ECONNRESET` / `ETIMEDOUT` / `ENOTFOUND`.
 *   3. `err.code` — a library/provider code.
 * Returns null when nothing safe is available — an honest NULL, never a guess and never prose.
 * NOTE what is NOT here: `err.message`, and nothing at all from the provider's response body.
 * The shape rule itself lives in ./safe-code (shared with the CSV import route, T-49).
 */
export function sendFailureCode(err: unknown): string | null {
  const e = (err ?? {}) as {
    status?: unknown;
    code?: unknown;
    cause?: { code?: unknown } | null;
  };
  if (typeof e.status === "number" && Number.isFinite(e.status)) return String(e.status);
  for (const raw of [e.cause?.code, e.code]) {
    const code = safeCode(raw);
    if (code !== null) return code;
  }
  return null;
}

/**
 * Rule 4 — hard precondition: a rendered campaign message MUST carry the signed unsubscribe link in
 * BOTH the plain-text and HTML bodies. Throws (aborting the whole run before any send) if not. This
 * is deliberately un-catchable inside the loop: "a campaign email without the link cannot be sent at
 * all" means the run fails loudly, it does not skip-and-continue.
 */
export function assertHasUnsubscribeLink(message: RenderedMessage): void {
  const url = message.unsubscribeUrl;
  if (!url || url.trim() === "") {
    throw new Error("Refusing to send: message has no unsubscribe URL (campaign send precondition).");
  }
  if (!message.text.includes(url) || !message.html.includes(url)) {
    throw new Error("Refusing to send: unsubscribe URL missing from the message body (text and/or HTML).");
  }
}

/** Should the run auto-stop for hard bounces (rule 6)? Only after a minimum sample. */
export function shouldStopForBounces(
  hardBounces: number,
  attempted: number,
  threshold: number,
  minSample: number,
): boolean {
  if (attempted < minSample) return false;
  return hardBounces / attempted > threshold;
}

/** A zeroed per-cause counter. EXPORTED so no caller hand-writes the object literal and silently
 *  omits a newly added cause (the pre-run bounce halt in send-campaign.ts did exactly that). */
export function emptySendFailureCounts(): Record<SendFailureCause, number> {
  return {
    invalid_address: 0,
    hard_bounce: 0,
    provider_rejected: 0,
    provider_throttled: 0,
    unknown: 0,
  };
}

/**
 * Run one manual send over `recipients`. Sequential on purpose: the daily budget and the bounce
 * ratio are running totals that must be read between recipients, and a marketing send is not
 * latency-critical. Returns a summary; the caller writes the single audit row from it.
 */
export async function runSend(
  recipients: readonly SendRecipient[],
  ports: SendPorts,
  campaignId: string,
  hashIdentityFor: (r: SendRecipient) => string,
  config: SendConfig = DEFAULT_SEND_CONFIG,
  rng: () => number = Math.random,
): Promise<SendSummary> {
  const summary: SendSummary = {
    attempted: 0,
    sent: 0,
    skippedSuppressed: 0,
    skippedAlreadySent: 0,
    failed: emptySendFailureCounts(),
    deferredDailyLimit: 0,
    stoppedHighBounce: false,
    stoppedConsecutiveFailures: false,
    retriedSends: 0,
    haltedForBatch: false,
  };

  const alreadyToday = await ports.todaySentCount();
  let budget = Math.max(0, config.dailyLimit - alreadyToday);
  let hardBounces = 0;
  let consecutiveFailures = 0;

  for (const r of recipients) {
    if (summary.stoppedHighBounce || summary.stoppedConsecutiveFailures) break;

    // BATCH CAP (P0-3). Once this invocation has claimed `maxPerInvocation` send attempts AND another
    // recipient still remains, stop and flag `haltedForBatch` so the background drainer continues on
    // the next tick. Checked at the TOP so it never fires on the exact last recipient (the for-loop
    // ends first → haltedForBatch stays false → the run is treated as drained, not halted). Only real
    // send attempts count (summary.attempted) — suppressed / already-sent / daily-deferred recipients
    // below cost nothing and pass through, so a tick still finishes cheap skips within one pass.
    if (summary.attempted >= config.maxPerInvocation) {
      summary.haltedForBatch = true;
      break;
    }

    // Rule 1: suppression is checked HERE, at send time — not when the segment was counted.
    if (await ports.isSuppressed(r.customerId, r.channel)) {
      const key = buildIdempotencyKey({ campaignId, customerId: r.customerId, channel: r.channel });
      // Record the skip (idempotent) so the skipped COUNT is visible; if the row already exists
      // (a prior run) claim returns false and we simply count it.
      const claimed = await ports.claim(key, {
        customerId: r.customerId,
        channel: r.channel,
        identityHash: hashIdentityFor(r),
        language: r.language,
        campaignId,
      });
      if (claimed) await ports.record(key, { status: "skipped_suppressed" });
      summary.skippedSuppressed++;
      continue;
    }

    // Rule 3: over today's budget → DEFER (leave unclaimed for a later run), do not fail.
    if (budget <= 0) {
      summary.deferredDailyLimit++;
      continue;
    }

    // Rule 4: render, then REFUSE the whole run if the unsubscribe link is missing (throws).
    const message = await ports.render(r);
    assertHasUnsubscribeLink(message);

    // Rule 2: claim by the deterministic key. Already-present → a prior run handled it; skip.
    const key = buildIdempotencyKey({ campaignId, customerId: r.customerId, channel: r.channel });
    const claimed = await ports.claim(key, {
      customerId: r.customerId,
      channel: r.channel,
      identityHash: hashIdentityFor(r),
      language: r.language,
      campaignId,
    });
    if (!claimed) {
      summary.skippedAlreadySent++;
      continue;
    }

    summary.attempted++;
    // Rule 8 (BACKOFF). Retry the SAME recipient on a retryable error (provider throttle / network),
    // pausing between tries; give up after config.maxSendAttempts and record the failure as usual.
    //
    // HOW THIS INTERACTS WITH RULE 7 (the 20-in-a-row wall): the consecutive-failure counter counts
    // fully-FAILED RECIPIENTS, incremented ONCE here after all retries are exhausted — never per
    // attempt. So the wall is still "20 recipients failed in a row", and backoff only DELAYS reaching
    // it (each failed recipient now costs up to ~7 s of waits). That is the point: a brief throttle
    // blip that a retry clears no longer burns a slot in the streak, so the run stops on a true wall,
    // not on a wobble. A single success anywhere resets the streak to 0, exactly as before.
    let err: unknown = null;
    let delivered = false;
    for (let attempt = 1; attempt <= config.maxSendAttempts; attempt++) {
      try {
        const res = await ports.send(r, message);
        await ports.record(key, { status: "sent", providerMessageId: res.providerMessageId });
        summary.sent++;
        budget--;
        consecutiveFailures = 0; // rule 7: the streak is CONSECUTIVE — one success clears it.
        delivered = true;
        break;
      } catch (e) {
        err = e;
        if (isRetryableSendError(e) && attempt < config.maxSendAttempts) {
          summary.retriedSends++;
          await ports.sleep(backoffDelayMs(attempt, config, rng)); // wait, then retry the SAME recipient
          continue;
        }
        break; // non-retryable, or attempts exhausted → fall through to the single failure record
      }
    }

    if (!delivered) {
      // Rule 5: differentiated cause; one failure does NOT stop the rest. Recorded ONCE per recipient
      // (after all retries), never once per attempt.
      const cause = classifySendFailure(err);
      const status = cause === "hard_bounce" ? "bounced" : "failed";
      // PII-free scalar only: HTTP status, else a network/library code of a safe shape, else null.
      const code = sendFailureCode(err);
      await ports.record(key, { status, failureCause: cause, code });
      summary.failed[cause]++;
      if (cause === "hard_bounce") hardBounces++;
      // Rule 6: auto-stop if the hard-bounce ratio crosses the approved threshold.
      if (shouldStopForBounces(hardBounces, summary.attempted, config.bounceThreshold, config.minBounceSample)) {
        summary.stoppedHighBounce = true;
      }
      // Rule 7: auto-stop on a WALL — see the note above the retry loop for how backoff changes the
      // TIMING of this but not the meaning.
      consecutiveFailures++;
      if (consecutiveFailures >= config.maxConsecutiveFailures) {
        summary.stoppedConsecutiveFailures = true;
      }
    }

    // Rule 9 (PACING). A base pause after every real send attempt — success or failure — so the run
    // never dead-sprints at the provider. Applied only here, where a request actually hit the API:
    // suppressed / deferred / already-claimed recipients above `continue` past this and cost nothing.
    if (config.interRecipientDelayMs > 0) await ports.sleep(config.interRecipientDelayMs);
  }

  return summary;
}
