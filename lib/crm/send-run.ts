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
}

export const DEFAULT_SEND_CONFIG: SendConfig = {
  dailyLimit: 1000,
  bounceThreshold: 0.05,
  minBounceSample: 20,
  maxConsecutiveFailures: 20,
};

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

/** Codes are stored VERBATIM in crm_message_log.error_message, a PII-free column, so only this
 *  shape is ever allowed through: letters, digits, `_ . -`, at most 40 chars. Anything else (any
 *  free text, therefore anything that could echo an address) is dropped rather than trimmed. */
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * The PII-free code recorded for a failed send. In priority order:
 *   1. `err.status` — the HTTP status our mailer now attaches (T-41).
 *   2. `err.cause.code` — a fetch/undici network throw's `ECONNRESET` / `ETIMEDOUT` / `ENOTFOUND`.
 *   3. `err.code` — a library/provider code.
 * Returns null when nothing safe is available — an honest NULL, never a guess and never prose.
 * NOTE what is NOT here: `err.message`, and nothing at all from the provider's response body.
 */
export function sendFailureCode(err: unknown): string | null {
  const e = (err ?? {}) as {
    status?: unknown;
    code?: unknown;
    cause?: { code?: unknown } | null;
  };
  if (typeof e.status === "number" && Number.isFinite(e.status)) return String(e.status);
  for (const raw of [e.cause?.code, e.code]) {
    if (raw == null) continue;
    const candidate = String(raw).trim();
    if (SAFE_CODE.test(candidate)) return candidate;
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
  };

  const alreadyToday = await ports.todaySentCount();
  let budget = Math.max(0, config.dailyLimit - alreadyToday);
  let hardBounces = 0;
  let consecutiveFailures = 0;

  for (const r of recipients) {
    if (summary.stoppedHighBounce || summary.stoppedConsecutiveFailures) break;

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
    try {
      const res = await ports.send(r, message);
      await ports.record(key, { status: "sent", providerMessageId: res.providerMessageId });
      summary.sent++;
      budget--;
      consecutiveFailures = 0; // rule 7: the streak is CONSECUTIVE — one success clears it.
    } catch (err) {
      // Rule 5: differentiated cause; one failure does NOT stop the rest.
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
      // Rule 7: auto-stop on a WALL. N failures in a row is a provider/config problem, not N
      // recipient problems; carrying on only writes thousands of identical rows (T-41's run wrote
      // 18,119 of them over 1h47m). The caller records the halt on the run itself.
      consecutiveFailures++;
      if (consecutiveFailures >= config.maxConsecutiveFailures) {
        summary.stoppedConsecutiveFailures = true;
      }
    }
  }

  return summary;
}
