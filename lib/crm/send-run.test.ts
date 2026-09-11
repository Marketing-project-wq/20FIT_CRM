import { describe, it, expect } from "vitest";
import {
  buildIdempotencyKey,
  classifySendFailure,
  assertHasUnsubscribeLink,
  shouldStopForBounces,
  requiresLargeSendConfirmation,
  runSend,
  sendFailureCode,
  totalFailed,
  dominantFailureCause,
  emptySendFailureCounts,
  isRetryableSendError,
  backoffDelayMs,
  DEFAULT_SEND_CONFIG,
  type SendPorts,
  type SendRecipient,
  type RenderedMessage,
  type ClaimMeta,
  type RecordOutcome,
  type SendConfig,
  type BatchSendResult,
} from "./send-run";

// ── An in-memory store implementing the ports. A "real interruption" is then just a partial call
//    to runSend followed by a full re-run against the SAME store — no double-send may occur. ──
class FakeStore implements SendPorts {
  rows = new Map<string, {
    status: string;
    customerId: string;
    failureCause?: string;
    code?: string | number | null;
  }>();
  suppressed = new Set<string>();
  sentCustomers: string[] = []; // every customerId a send() SUCCEEDED for, in order
  sendAttempts: string[] = []; // every customerId send() was ENTERED for (success or throw) — counts retries
  failFor = new Map<string, unknown>(); // customerId -> error thrown from send() EVERY time
  failNTimesFor = new Map<string, { err: unknown; remaining: number }>(); // throw N times, then succeed
  badRenderFor = new Set<string>(); // customerId -> render a message with NO unsubscribe url
  today = 0;

  async isSuppressed(customerId: string): Promise<boolean> {
    return this.suppressed.has(customerId);
  }
  async claim(key: string, meta: ClaimMeta): Promise<boolean> {
    if (this.rows.has(key)) return false;
    this.rows.set(key, { status: "queued", customerId: meta.customerId });
    return true;
  }
  async render(r: SendRecipient): Promise<RenderedMessage> {
    const url = this.badRenderFor.has(r.customerId)
      ? ""
      : `https://crm.20fit.id/unsubscribe?t=tok-${r.customerId}`;
    return {
      subject: "Halo",
      text: `Halo. Berhenti: ${url}`,
      html: `<p>Halo. <a href="${url}">Berhenti</a></p>`,
      unsubscribeUrl: url,
      templateKey: "welcome",
      templateVersion: 1,
    };
  }
  async send(r: SendRecipient): Promise<{ providerMessageId: string | null }> {
    this.sendAttempts.push(r.customerId);
    const always = this.failFor.get(r.customerId);
    if (always) throw always;
    const transient = this.failNTimesFor.get(r.customerId);
    if (transient && transient.remaining > 0) {
      transient.remaining--;
      throw transient.err;
    }
    this.sentCustomers.push(r.customerId);
    return { providerMessageId: `pm-${r.customerId}` };
  }
  async record(key: string, outcome: RecordOutcome): Promise<void> {
    const row = this.rows.get(key);
    if (row) {
      row.status = outcome.status;
      // What the adapter writes to crm_message_log.failure_cause / error_message.
      if (outcome.status === "failed" || outcome.status === "bounced") {
        row.failureCause = outcome.failureCause;
        row.code = outcome.code ?? null;
      }
    }
    if (outcome.status === "sent") this.today++;
  }
  async todaySentCount(): Promise<number> {
    return this.today;
  }
  // Records every backoff/pacing pause WITHOUT waiting, so timing rules are provable in milliseconds
  // of test time. `sleeps` is every pause; the sub-counts let a test separate backoff from pacing.
  sleeps: number[] = [];
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
  }
}

function mk(n: number): SendRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    customerId: `c${i}`,
    channel: "email" as const,
    identityKind: "email" as const,
    destination: `c${i}@example.com`,
    language: "id" as const,
  }));
}

const hashFor = (r: SendRecipient) => `hash-${r.customerId}`;

describe("send-run — deterministic idempotency key", () => {
  it("is a pure function of campaign + customer + channel", () => {
    const a = buildIdempotencyKey({ campaignId: "camp1", customerId: "c9", channel: "email" });
    const b = buildIdempotencyKey({ campaignId: "camp1", customerId: "c9", channel: "email" });
    expect(a).toBe(b);
    expect(a).toBe("camp1:c9:email");
  });
  it("differs by campaign, by recipient, and by channel", () => {
    expect(buildIdempotencyKey({ campaignId: "c2", customerId: "c9", channel: "email" })).not.toBe(
      buildIdempotencyKey({ campaignId: "c1", customerId: "c9", channel: "email" }),
    );
    expect(buildIdempotencyKey({ campaignId: "c1", customerId: "c8", channel: "email" })).not.toBe(
      buildIdempotencyKey({ campaignId: "c1", customerId: "c9", channel: "email" }),
    );
    expect(buildIdempotencyKey({ campaignId: "c1", customerId: "c9", channel: "whatsapp" })).not.toBe(
      buildIdempotencyKey({ campaignId: "c1", customerId: "c9", channel: "email" }),
    );
  });
});

describe("send-run — failure cause is differentiated (the reset lesson)", () => {
  it("recognises an invalid address", () => {
    expect(classifySendFailure({ status: 422, message: "Invalid email address" })).toBe("invalid_address");
    expect(classifySendFailure({ message: "mailbox does not exist" })).toBe("invalid_address");
  });
  it("recognises a hard bounce", () => {
    expect(classifySendFailure({ message: "550 hard bounce" })).toBe("hard_bounce");
    expect(classifySendFailure({ message: "Permanent failure" })).toBe("hard_bounce");
  });
  it("recognises a provider rejection", () => {
    expect(classifySendFailure({ status: 403, message: "sender blocked as spam" })).toBe("provider_rejected");
    expect(classifySendFailure({ status: 500 })).toBe("provider_rejected");
  });
  it("falls back to unknown — recorded distinctly, never hidden", () => {
    expect(classifySendFailure({ message: "something odd" })).toBe("unknown");
    expect(classifySendFailure(null)).toBe("unknown");
  });
});

describe("send-run — unsubscribe link is a hard precondition", () => {
  const msg = (url: string): RenderedMessage => ({
    subject: "s",
    text: `body ${url}`,
    html: `<p>${url}</p>`,
    unsubscribeUrl: url,
    templateKey: "t",
    templateVersion: 1,
  });
  it("passes when the url is present in both bodies", () => {
    expect(() => assertHasUnsubscribeLink(msg("https://u/x"))).not.toThrow();
  });
  it("throws on an empty url", () => {
    expect(() => assertHasUnsubscribeLink({ ...msg(""), unsubscribeUrl: "" })).toThrow(/unsubscribe/i);
  });
  it("throws when the url is set but missing from the body", () => {
    expect(() =>
      assertHasUnsubscribeLink({ ...msg("https://u/x"), text: "no link here", html: "<p>none</p>" }),
    ).toThrow(/unsubscribe/i);
  });
});

describe("send-run — bounce auto-stop + large-send confirmation (pure)", () => {
  it("does not stop before the minimum sample", () => {
    expect(shouldStopForBounces(1, 1, 0.05, 20)).toBe(false);
  });
  it("stops once the ratio crosses the threshold after the sample", () => {
    expect(shouldStopForBounces(2, 20, 0.05, 20)).toBe(true); // 10% > 5%
    expect(shouldStopForBounces(1, 20, 0.05, 20)).toBe(false); // 5% not > 5%
  });
  it("requires a second confirmation above 500 recipients", () => {
    expect(requiresLargeSendConfirmation(500)).toBe(false);
    expect(requiresLargeSendConfirmation(501)).toBe(true);
  });
});

describe("send-run — suppression is checked AT SEND, not at count time", () => {
  it("records skipped_suppressed and never calls send for a suppressed recipient", async () => {
    const store = new FakeStore();
    store.suppressed.add("c1"); // unsubscribed AFTER the segment was counted
    const summary = await runSend(mk(3), store, "camp1", hashFor);
    expect(summary.sent).toBe(2);
    expect(summary.skippedSuppressed).toBe(1);
    expect(store.sentCustomers).not.toContain("c1"); // never sent
    expect(store.rows.get("camp1:c1:email")?.status).toBe("skipped_suppressed"); // visible, not dropped
  });
});

describe("send-run — daily limit from the log defers, not fails", () => {
  it("sends only the remaining budget and defers the rest (leaves them unclaimed)", async () => {
    const store = new FakeStore();
    store.today = 998; // already sent today, read FROM THE LOG
    const summary = await runSend(mk(5), store, "camp1", hashFor, { ...DEFAULT_SEND_CONFIG, dailyLimit: 1000 });
    expect(summary.sent).toBe(2);
    expect(summary.deferredDailyLimit).toBe(3);
    expect(store.rows.size).toBe(2); // deferred recipients are NOT claimed — a later run picks them up
  });
});

describe("send-run — a per-recipient failure does not stop the rest, and keeps its cause", () => {
  it("continues past a provider rejection and records the distinct cause", async () => {
    const store = new FakeStore();
    store.failFor.set("c1", { status: 403, message: "sender blocked as spam" });
    const summary = await runSend(mk(4), store, "camp1", hashFor);
    expect(summary.sent).toBe(3);
    expect(summary.failed.provider_rejected).toBe(1);
    expect(summary.attempted).toBe(4); // all four were tried
    expect(store.rows.get("camp1:c1:email")?.status).toBe("failed");
  });
});

describe("send-run — hard-bounce auto-stop", () => {
  it("stops the run once the hard-bounce ratio crosses the threshold", async () => {
    const store = new FakeStore();
    for (let i = 0; i < 5; i++) store.failFor.set(`c${i}`, { message: "550 hard bounce" });
    const summary = await runSend(mk(5), store, "camp1", hashFor, {
      ...DEFAULT_SEND_CONFIG,
      bounceThreshold: 0.5,
      minBounceSample: 2,
    });
    expect(summary.stoppedHighBounce).toBe(true);
    expect(summary.attempted).toBe(2); // stopped after the 2nd, did not burn the whole list
    expect(summary.failed.hard_bounce).toBe(2);
  });
});

describe("send-run — the unsubscribe precondition aborts the WHOLE run before any send", () => {
  it("throws and sends nobody when the first message lacks the link", async () => {
    const store = new FakeStore();
    store.badRenderFor.add("c0");
    await expect(runSend(mk(3), store, "camp1", hashFor)).rejects.toThrow(/unsubscribe/i);
    expect(store.sentCustomers).toEqual([]); // nothing sent
    expect(store.rows.size).toBe(0); // and nothing even claimed (assert runs before claim)
  });
});

describe("send-run — RESUME AFTER A REAL INTERRUPTION (no double-send)", () => {
  it("re-running a partially-completed send sends only the remainder, nobody twice", async () => {
    const store = new FakeStore();
    const all = mk(10);

    // The process got through the first 6 recipients, then died (deploy / OOM / timeout). We model
    // that as a real partial run over the first 6 — 6 rows persist in the store.
    const first = await runSend(all.slice(0, 6), store, "camp1", hashFor);
    expect(first.sent).toBe(6);
    expect(store.sentCustomers).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);

    // RESUME: re-run the FULL list with the same campaignId. Deterministic keys mean the first 6
    // are already claimed → skipped; only the last 4 send.
    const resumed = await runSend(all, store, "camp1", hashFor);
    expect(resumed.sent).toBe(4);
    expect(resumed.skippedAlreadySent).toBe(6);

    // The whole campaign sent exactly 10 messages, each recipient exactly once — NO double send.
    expect(store.sentCustomers).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]);
    expect(new Set(store.sentCustomers).size).toBe(10);
    expect(store.rows.size).toBe(10);
  });

  it("a duplicate key is refused by claim (belt-and-suspenders to the interruption test)", async () => {
    const store = new FakeStore();
    const key = buildIdempotencyKey({ campaignId: "camp1", customerId: "c0", channel: "email" });
    const meta: ClaimMeta = {
      customerId: "c0",
      channel: "email",
      identityHash: "h",
      language: "id",
      campaignId: "camp1",
    };
    expect(await store.claim(key, meta)).toBe(true);
    expect(await store.claim(key, meta)).toBe(false); // same key never claims twice
  });
});

// ── T-41: the HTTP status is no longer thrown away ────────────────────────────────────────────
//
// The 3 Sep 2026 run wrote 18,119 rows, every one of them `failure_cause = 'unknown'` with
// `error_message = NULL`, because the mailer's error carried the status only inside a MESSAGE STRING
// and nothing read it back out. The mailer now attaches `err.status`; these lock what the classifier
// and the code extractor do with it — and, just as load-bearing, what they refuse to record.

describe("classifySendFailure — provider throttling is its own class, never a recipient problem", () => {
  const THROTTLE = [
    { status: 429, why: "rate limited" },
    { status: 402, why: "quota / payment exhausted" },
    { status: 503, why: "provider unavailable" },
  ];
  for (const { status, why } of THROTTLE) {
    it(`HTTP ${status} (${why}) → provider_throttled`, () => {
      // Exactly the error our mailer throws: status property, status-only message, no body.
      const err = Object.assign(new Error(`Mailtrap send failed with HTTP ${status}.`), { status });
      expect(classifySendFailure(err)).toBe("provider_throttled");
    });
  }

  it("does NOT fold throttling into provider_rejected", () => {
    // The whole reason the class exists: 'provider_rejected' means the RECIPIENT was rejected, and a
    // future suppression/bounce decision reading these counts must not see our own rate limit there.
    for (const { status } of THROTTLE) {
      expect(classifySendFailure({ status })).not.toBe("provider_rejected");
      expect(classifySendFailure({ status })).not.toBe("hard_bounce");
      expect(classifySendFailure({ status })).not.toBe("invalid_address");
    }
  });
});

describe("classifySendFailure — other statuses", () => {
  const CASES: { name: string; err: unknown; expected: string }[] = [
    { name: "400 bad request", err: { status: 400 }, expected: "provider_rejected" },
    { name: "401 unauthorized (dead credential)", err: { status: 401 }, expected: "provider_rejected" },
    { name: "403 forbidden", err: { status: 403 }, expected: "provider_rejected" },
    { name: "422 unprocessable", err: { status: 422 }, expected: "provider_rejected" },
    { name: "500 server error", err: { status: 500 }, expected: "provider_rejected" },
    { name: "504 gateway timeout", err: { status: 504 }, expected: "provider_rejected" },
    // No status at all → the keyword branches still apply, unchanged.
    { name: "a 550 hard bounce in prose", err: { message: "550 hard bounce" }, expected: "hard_bounce" },
    { name: "an invalid recipient address in prose", err: { message: "invalid email address" }, expected: "invalid_address" },
    // A network throw: no status, no matching keyword. Honest 'unknown' — but NOT silent, see below.
    { name: "a connection reset", err: Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }), expected: "unknown" },
    { name: "a timeout", err: Object.assign(new Error("fetch failed"), { cause: { code: "ETIMEDOUT" } }), expected: "unknown" },
    { name: "nothing at all", err: undefined, expected: "unknown" },
  ];
  for (const c of CASES) {
    it(`${c.name} → ${c.expected}`, () => {
      expect(classifySendFailure(c.err)).toBe(c.expected);
    });
  }

  it("a throttle status outranks any prose that comes with it", () => {
    // Step 1 is absolute. Even an error that talks about the recipient stays 'provider_throttled'
    // when the status says the provider is rate-limiting us — that is the whole point of the class.
    expect(classifySendFailure({ status: 429, message: "invalid email address" })).toBe("provider_throttled");
    expect(classifySendFailure({ status: 503, message: "550 hard bounce" })).toBe("provider_throttled");
  });

  it("a recipient-level keyword still refines a non-throttle status (pre-existing rule, kept)", () => {
    // 422 + "invalid email address" is more specific than "the provider rejected it". Our own mailer
    // never carries such prose, so this only fires for an error that genuinely has it.
    expect(classifySendFailure({ status: 422, message: "Invalid email address" })).toBe("invalid_address");
  });
});

describe("sendFailureCode — a PII-free code, or an honest null", () => {
  it("prefers the HTTP status", () => {
    expect(sendFailureCode({ status: 429, code: "SOMETHING" })).toBe("429");
    expect(sendFailureCode({ status: 500 })).toBe("500");
  });

  it("falls back to a network code from err.cause (fetch/undici)", () => {
    expect(sendFailureCode(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }))).toBe("ECONNRESET");
    expect(sendFailureCode(Object.assign(new Error("fetch failed"), { cause: { code: "ETIMEDOUT" } }))).toBe("ETIMEDOUT");
    expect(sendFailureCode(Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }))).toBe("ENOTFOUND");
  });

  it("falls back to a library/provider code last", () => {
    expect(sendFailureCode({ code: "23505" })).toBe("23505");
  });

  it("returns null rather than a guess when there is nothing safe", () => {
    expect(sendFailureCode(new Error("boom"))).toBeNull();
    expect(sendFailureCode(undefined)).toBeNull();
    expect(sendFailureCode({})).toBeNull();
  });

  // THE PII RULE. crm_message_log stores no readable contact (identity is a keyed HMAC), and a
  // provider response body can echo the recipient's address — so error_message takes a CODE-SHAPED
  // value or nothing. Free text is dropped whole, never trimmed into the column.
  it("refuses anything that is not code-shaped — no prose, no addresses, ever", () => {
    expect(sendFailureCode({ code: "rejected for orang@contoh.co.id" })).toBeNull();
    expect(sendFailureCode({ cause: { code: "mailbox orang@contoh.co.id does not exist" } })).toBeNull();
    expect(sendFailureCode({ code: "a code with spaces" })).toBeNull();
    expect(sendFailureCode({ code: "x".repeat(41) })).toBeNull(); // over the 40-char cap
  });
});

describe("send-run — every failure with an HTTP status is recorded with a cause AND a code", () => {
  it("records status + class, never 'unknown' + NULL (the 18,119-row shape)", async () => {
    const store = new FakeStore();
    store.failFor.set("c0", Object.assign(new Error("Mailtrap send failed with HTTP 429."), { status: 429 }));
    store.failFor.set("c1", Object.assign(new Error("Mailtrap send failed with HTTP 401."), { status: 401 }));
    store.failFor.set("c2", Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }));
    const summary = await runSend(mk(4), store, "camp1", hashFor);

    expect(store.rows.get("camp1:c0:email")).toMatchObject({ failureCause: "provider_throttled", code: "429" });
    expect(store.rows.get("camp1:c1:email")).toMatchObject({ failureCause: "provider_rejected", code: "401" });
    // A network throw has no HTTP status, so its class is honestly 'unknown' — but the code is there,
    // which is the whole difference from a row that says nothing at all.
    expect(store.rows.get("camp1:c2:email")).toMatchObject({ failureCause: "unknown", code: "ECONNRESET" });
    expect(summary.sent).toBe(1);
    expect(totalFailed(summary.failed)).toBe(3);
  });

  it("no failure with an HTTP status lands as unknown+null", async () => {
    for (const status of [400, 401, 402, 403, 422, 429, 500, 503, 504]) {
      const store = new FakeStore();
      store.failFor.set("c0", Object.assign(new Error(`Mailtrap send failed with HTTP ${status}.`), { status }));
      await runSend(mk(1), store, `camp-${status}`, hashFor);
      const row = store.rows.get(`camp-${status}:c0:email`);
      expect(row?.failureCause).not.toBe("unknown");
      expect(row?.code).toBe(String(status));
    }
  });
});

describe("totalFailed / dominantFailureCause", () => {
  it("totals every cause, including one added later", () => {
    const failed = { ...emptySendFailureCounts(), provider_throttled: 3, unknown: 2 };
    expect(totalFailed(failed)).toBe(5);
    expect(totalFailed(emptySendFailureCounts())).toBe(0);
  });

  it("names the dominant cause, or null when nothing failed", () => {
    expect(dominantFailureCause({ ...emptySendFailureCounts(), provider_throttled: 9, unknown: 2 })).toBe("provider_throttled");
    expect(dominantFailureCause(emptySendFailureCounts())).toBeNull();
  });
});

// ── The wall (K-56): 20 failures in a row stops the run ───────────────────────────────────────
describe("send-run — consecutive-failure auto-stop", () => {
  it("halts after 20 failures in a row instead of writing the whole list as failures", async () => {
    const store = new FakeStore();
    const all = mk(1000);
    for (const r of all) {
      store.failFor.set(r.customerId, Object.assign(new Error("Mailtrap send failed with HTTP 429."), { status: 429 }));
    }
    const summary = await runSend(all, store, "camp1", hashFor);

    expect(summary.stoppedConsecutiveFailures).toBe(true);
    expect(summary.attempted).toBe(20); // exactly the threshold — the other 980 were never touched
    expect(summary.failed.provider_throttled).toBe(20);
    expect(store.rows.size).toBe(20); // and no log row was written for the remaining 980
  });

  it("uses the configured threshold", async () => {
    const store = new FakeStore();
    const all = mk(50);
    for (const r of all) store.failFor.set(r.customerId, { status: 500 });
    const summary = await runSend(all, store, "camp1", hashFor, {
      ...DEFAULT_SEND_CONFIG,
      maxConsecutiveFailures: 5,
    });
    expect(summary.attempted).toBe(5);
    expect(summary.stoppedConsecutiveFailures).toBe(true);
  });

  it("the streak is CONSECUTIVE — a success in between clears it", async () => {
    const store = new FakeStore();
    const all = mk(40);
    // Fail everyone except c19, sitting one short of the threshold. The run must survive past it.
    for (const r of all) {
      if (r.customerId !== "c19") store.failFor.set(r.customerId, { status: 500 });
    }
    const summary = await runSend(all, store, "camp1", hashFor);
    expect(summary.sent).toBe(1);
    // 19 failures, the success resets the counter, then 20 more failures trip the wall.
    expect(summary.attempted).toBe(40);
    expect(summary.stoppedConsecutiveFailures).toBe(true);
  });

  it("does not fire on a run that is merely failing sometimes", async () => {
    const store = new FakeStore();
    const all = mk(60);
    for (const r of all) {
      if (Number(r.customerId.slice(1)) % 2 === 0) store.failFor.set(r.customerId, { status: 500 });
    }
    const summary = await runSend(all, store, "camp1", hashFor);
    expect(summary.stoppedConsecutiveFailures).toBe(false);
    expect(summary.attempted).toBe(60); // the whole list was tried
    expect(summary.sent).toBe(30);
  });

  it("DEFAULT_SEND_CONFIG carries the owner-approved threshold of 20", () => {
    expect(DEFAULT_SEND_CONFIG.maxConsecutiveFailures).toBe(20);
  });
});

describe("send-run — rule 8 backoff + rule 9 pacing (8 Sep 2026)", () => {
  const RNG0 = () => 0; // deterministic: backoffDelayMs → half the base (500, 1000, 2000)

  /** Pacing is OFF by default since 11 Sep 2026 (owner: campaigns must not wait), but the pacing
   *  MECHANISM is still a supported knob an operator can turn back on — so these tests drive it
   *  explicitly instead of leaning on the default. That keeps the behaviour covered while the
   *  DEFAULT is pinned separately, below, at 0. */
  const PACED: SendConfig = { ...DEFAULT_SEND_CONFIG, interRecipientDelayMs: 500 };

  it("throttle ONCE → the same recipient succeeds on the second attempt", async () => {
    const store = new FakeStore();
    store.failNTimesFor.set("c0", { err: { status: 429 }, remaining: 1 });
    const s = await runSend(mk(1), store, "camp", hashFor, PACED, RNG0);
    expect(s.sent).toBe(1);
    expect(totalFailed(s.failed)).toBe(0);
    expect(s.retriedSends).toBe(1);
    expect(store.sendAttempts.filter((c) => c === "c0")).toHaveLength(2); // failed once, then sent
    expect(store.rows.get("camp:c0:email")?.status).toBe("sent");
    // one backoff wait (500 at rng=0) BEFORE the retry, then one pacing pause (500) after success.
    expect(store.sleeps).toEqual([500, 500]);
  });

  it("throttle ALWAYS → fails after max attempts, recorded provider_throttled (not a recipient fault)", async () => {
    const store = new FakeStore();
    store.failFor.set("c0", { status: 503 }); // provider capacity — throttle status, thrown every time
    const s = await runSend(mk(1), store, "camp", hashFor, PACED, RNG0);
    expect(s.sent).toBe(0);
    expect(s.failed.provider_throttled).toBe(1);
    expect(s.retriedSends).toBe(3); // 4 attempts ⇒ 3 retries
    expect(store.sendAttempts.filter((c) => c === "c0")).toHaveLength(4);
    const row = store.rows.get("camp:c0:email");
    expect(row?.status).toBe("failed");
    expect(row?.failureCause).toBe("provider_throttled");
    expect(row?.code).toBe("503"); // the PII-free status still recorded
    // 3 backoff waits (500,1000,2000) then one pacing pause (500).
    expect(store.sleeps).toEqual([500, 1000, 2000, 500]);
  });

  it("backoff does NOT change the outcome for a NON-throttle failure — no retry, one attempt", async () => {
    const store = new FakeStore();
    store.failFor.set("c0", { status: 422, message: "invalid email address" });
    const s = await runSend(mk(1), store, "camp", hashFor, PACED, RNG0);
    expect(s.failed.invalid_address).toBe(1);
    expect(s.retriedSends).toBe(0);
    expect(store.sendAttempts.filter((c) => c === "c0")).toHaveLength(1); // recipient-level → tried once
    // no backoff wait; only the pacing pause after the (final) attempt.
    expect(store.sleeps).toEqual([500]);
  });

  it("a network throw (no HTTP status) IS retried; a bare 4xx rejection is NOT", () => {
    expect(isRetryableSendError({ cause: { code: "ECONNRESET" } })).toBe(true);
    expect(isRetryableSendError({ message: "fetch failed" })).toBe(true);
    expect(isRetryableSendError({ status: 429 })).toBe(true);
    expect(isRetryableSendError({ status: 402 })).toBe(true);
    expect(isRetryableSendError({ status: 400 })).toBe(false); // has a status, not throttle ⇒ recipient-level
    expect(isRetryableSendError({ status: 550, message: "hard bounce" })).toBe(false);
  });

  it("backoffDelayMs doubles per attempt and stays within [half, full] with jitter", () => {
    expect(backoffDelayMs(1, DEFAULT_SEND_CONFIG, () => 0)).toBe(500);
    expect(backoffDelayMs(1, DEFAULT_SEND_CONFIG, () => 1)).toBe(1000);
    expect(backoffDelayMs(2, DEFAULT_SEND_CONFIG, () => 0)).toBe(1000);
    expect(backoffDelayMs(3, DEFAULT_SEND_CONFIG, () => 0)).toBe(2000);
    const mid = backoffDelayMs(1, DEFAULT_SEND_CONFIG, () => 0.5);
    expect(mid).toBeGreaterThanOrEqual(500);
    expect(mid).toBeLessThanOrEqual(1000);
  });

  it("a transient throttle that a retry clears does NOT burn a slot in the 20-in-a-row wall", async () => {
    // 25 recipients, EACH throttled once then delivered. Old behaviour would be irrelevant (they all
    // succeed), but this proves the streak never accumulates across recipients cleared by retry.
    const store = new FakeStore();
    for (let i = 0; i < 25; i++) store.failNTimesFor.set(`c${i}`, { err: { status: 429 }, remaining: 1 });
    const s = await runSend(mk(25), store, "camp", hashFor, DEFAULT_SEND_CONFIG, RNG0);
    expect(s.sent).toBe(25);
    expect(s.retriedSends).toBe(25);
    expect(s.stoppedConsecutiveFailures).toBe(false);
  });

  it("pacing pauses once per REAL attempt only — suppressed/deferred recipients cost no pause", async () => {
    const store = new FakeStore();
    store.suppressed.add("c1"); // skipped_suppressed → no provider call, no pacing pause
    const s = await runSend(mk(3), store, "camp", hashFor, PACED, RNG0);
    expect(s.sent).toBe(2);
    expect(s.skippedSuppressed).toBe(1);
    expect(store.sleeps).toEqual([500, 500]); // two sends → two pacing pauses; the skip added none
  });

  it("DEFAULT config keeps backoff, but pacing is OFF (owner decision, 11 Sep 2026)", () => {
    expect(DEFAULT_SEND_CONFIG.maxSendAttempts).toBe(4);
    expect(DEFAULT_SEND_CONFIG.backoffBaseMs).toBe(1000);
    // 0, not 500: the owner required that campaigns never wait. Backoff is untouched — reacting to a
    // 429 is not a delay we chose, it is the provider telling us to stop.
    expect(DEFAULT_SEND_CONFIG.interRecipientDelayMs).toBe(0);
  });

  it("pacing is genuinely skipped at 0 — a default run performs no sleeps at all", async () => {
    const store = new FakeStore();
    const s = await runSend(mk(3), store, "camp", hashFor, DEFAULT_SEND_CONFIG, RNG0);
    expect(s.sent).toBe(3);
    expect(store.sleeps).toEqual([]); // no pacing pause, and no backoff (nothing failed)
  });
});

// ── P0-3: the per-invocation batch cap (background drainer) ────────────────────────────────────
//
// A tick of the background drainer sends at most `maxPerInvocation`, so one HTTP invocation is
// bounded in duration. `haltedForBatch` tells the drainer "there is MORE right now, continue on the
// next tick" — distinct from `deferredDailyLimit` ("today's shared budget is spent, wait for
// tomorrow / a human resume"). The two must never be confused: the first re-arms in minutes, the
// second waits a day.
describe("send-run — batch cap (maxPerInvocation)", () => {
  it("stops after the cap and flags haltedForBatch, leaving the rest UNCLAIMED", async () => {
    const store = new FakeStore();
    const s = await runSend(mk(10), store, "camp", hashFor, { ...DEFAULT_SEND_CONFIG, maxPerInvocation: 4 });
    expect(s.sent).toBe(4);
    expect(s.haltedForBatch).toBe(true); // more remained → the drainer continues next tick
    expect(s.deferredDailyLimit).toBe(0); // NOT a daily-budget stop — budget was untouched
    expect(store.sentCustomers).toEqual(["c0", "c1", "c2", "c3"]);
    expect(store.rows.size).toBe(4); // the other six are neither sent nor claimed — a later tick gets them
  });

  it("does NOT flag haltedForBatch when the cap lands exactly on the last recipient (drained)", async () => {
    const store = new FakeStore();
    const s = await runSend(mk(4), store, "camp", hashFor, { ...DEFAULT_SEND_CONFIG, maxPerInvocation: 4 });
    expect(s.sent).toBe(4);
    expect(s.haltedForBatch).toBe(false); // the loop ended on its own → the run is DONE, not halted
  });

  it("re-arms across ticks: three capped invocations drain the whole run, nobody twice", async () => {
    const store = new FakeStore();
    const all = mk(10);
    const cfg = { ...DEFAULT_SEND_CONFIG, maxPerInvocation: 4 };

    const t1 = await runSend(all, store, "camp", hashFor, cfg);
    expect(t1.sent).toBe(4);
    expect(t1.haltedForBatch).toBe(true);

    const t2 = await runSend(all, store, "camp", hashFor, cfg);
    expect(t2.sent).toBe(4);
    expect(t2.skippedAlreadySent).toBe(4); // the first tick's 4 are claim-skipped
    expect(t2.haltedForBatch).toBe(true);

    const t3 = await runSend(all, store, "camp", hashFor, cfg);
    expect(t3.sent).toBe(2);
    expect(t3.skippedAlreadySent).toBe(8);
    expect(t3.haltedForBatch).toBe(false); // nothing left → drained

    expect(store.sentCustomers).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]);
    expect(new Set(store.sentCustomers).size).toBe(10); // each exactly once
  });

  it("only SEND attempts count against the cap — suppressed recipients pass through freely", async () => {
    const store = new FakeStore();
    store.suppressed.add("c1");
    store.suppressed.add("c2");
    // cap 2 real sends; the two suppressed skips in between must not consume the cap.
    const s = await runSend(mk(6), store, "camp", hashFor, { ...DEFAULT_SEND_CONFIG, maxPerInvocation: 2 });
    expect(s.sent).toBe(2); // c0, c3
    expect(s.skippedSuppressed).toBe(2); // c1, c2 — skipped, not counted against the cap
    expect(s.haltedForBatch).toBe(true); // c4, c5 remain
    expect(store.sentCustomers).toEqual(["c0", "c3"]);
  });

  it("the daily budget still bounds a capped run — a budget stop reads deferred, not halted", async () => {
    const store = new FakeStore();
    store.today = 997; // budget = 3
    // cap is larger than the budget, so the BUDGET is the limiter, not the cap.
    const s = await runSend(mk(10), store, "camp", hashFor, {
      ...DEFAULT_SEND_CONFIG,
      dailyLimit: 1000,
      maxPerInvocation: 8,
    });
    expect(s.sent).toBe(3);
    expect(s.deferredDailyLimit).toBe(7); // the rest wait for TOMORROW (a human resume), not this cycle
    expect(s.haltedForBatch).toBe(false); // NOT a batch halt — the drainer pauses, it does not re-arm
  });

  it("the DEFAULT config imposes no cap — a large run sends the whole list in one call", async () => {
    const store = new FakeStore();
    const s = await runSend(mk(250), store, "camp", hashFor); // DEFAULT_SEND_CONFIG
    expect(s.sent).toBe(250);
    expect(s.haltedForBatch).toBe(false);
    expect(DEFAULT_SEND_CONFIG.maxPerInvocation).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ── P0-3: TWO EXECUTOR TICKS OVERLAP on the SAME run — no double-send ──────────────────────────
//
// The pg_cron executor fires every few minutes; if one tick runs long, the next can start before it
// finishes, both draining the SAME run (same campaign_id). The drain-claim (drain_claimed_at,
// optimistic-concurrency) REDUCES this, but it is NOT the correctness guard — the correctness guard is
// the DETERMINISTIC idempotency key + a UNIQUE index on crm_message_log.idempotency_key: claim() is
// INSERT-if-absent and returns false on the unique violation (23505), so a recipient already claimed by
// one tick is skipped by the other. This is the exact property that keeps the 890-recipient incident
// from becoming 890 double-sends through the new (background) door.
//
// HONEST BOUNDARY (state it, don't imply more): FakeStore.claim models that unique-index atomicity
// (Map has→set, no await between, so the first claim of a key wins) — the SAME contract the real
// adapter gets from Postgres's UNIQUE constraint + the `error.code === "23505" → return false` branch
// in send-campaign.ts. The true DB-level guarantee (two INSERTs of one key across two connections) is
// an INTEGRATION property that this unit suite, running against an in-memory fake, does not exercise.
// What this test proves is that the ENGINE's use of the claim is correct under interleaving: given an
// atomic claim, two concurrent ticks send each recipient exactly once.
describe("send-run — overlapping ticks send each recipient exactly once", () => {
  it("two concurrent runs over the same campaign + store double-send NOBODY", async () => {
    const store = new FakeStore();
    const all = mk(20);
    // Promise.all interleaves the two runs at every await point (single-threaded microtask scheduling).
    const [a, b] = await Promise.all([
      runSend(all, store, "camp", hashFor),
      runSend(all, store, "camp", hashFor),
    ]);

    // Each recipient was SENT exactly once across both ticks — the invariant, whatever the interleaving.
    expect(store.sentCustomers.length).toBe(20);
    expect(new Set(store.sentCustomers).size).toBe(20);
    expect(store.rows.size).toBe(20); // one claim row per recipient — never two for the same key

    // The 20 sends are split between the ticks; every recipient the other tick reached was skipped as
    // already-claimed. sent + skipped, summed across both ticks, accounts for all 20 twice: 20 sent
    // total, 20 already-sent skips total (the loser of each claim race).
    expect(a.sent + b.sent).toBe(20);
    expect(a.skippedAlreadySent + b.skippedAlreadySent).toBe(20);
  });

  it("the claim is atomic per key — a second claim of a key never succeeds, even interleaved", async () => {
    // The unit-level equivalent of the UNIQUE index: fire many claims of the SAME key concurrently;
    // exactly one wins. This is what makes the interleaved run above safe.
    const store = new FakeStore();
    const key = buildIdempotencyKey({ campaignId: "camp", customerId: "c0", channel: "email" });
    const meta: ClaimMeta = { customerId: "c0", channel: "email", identityHash: "h", language: "id", campaignId: "camp" };
    const results = await Promise.all(Array.from({ length: 10 }, () => store.claim(key, meta)));
    expect(results.filter((r) => r === true)).toHaveLength(1); // exactly one true
    expect(results.filter((r) => r === false)).toHaveLength(9);
  });
});

// ── BATCHING (11 Sep 2026) ────────────────────────────────────────────────────────────────────
// The batch path is the one place where a single provider request decides the fate of up to 100
// recipients, so these tests are written around the ways that can go wrong rather than the happy
// path alone: a rejected chunk must not blame innocent recipients, a partially-delivered chunk must
// never be re-sent, and a claimed recipient must never be left without an outcome.
class BatchStore extends FakeStore {
  batchCalls: string[][] = []; // customerIds per sendBatch request, in call order
  failBatchWith: unknown = null; // when set, EVERY sendBatch request throws this
  failBatchNTimes = 0; // throw from sendBatch this many times, then behave
  shortBy = 0; // return this many FEWER results than inputs (a contract violation)

  async sendBatch(
    items: readonly { recipient: SendRecipient; message: RenderedMessage }[],
  ): Promise<readonly BatchSendResult[]> {
    this.batchCalls.push(items.map((i) => i.recipient.customerId));
    if (this.failBatchNTimes > 0) {
      this.failBatchNTimes--;
      throw this.failBatchWith ?? { status: 429 };
    }
    if (this.failBatchWith) throw this.failBatchWith;
    const out = items.map((it): BatchSendResult => {
      // Reuse the single-send fault injection so batch and sequential tests describe faults the
      // same way — a per-ITEM error here, never a thrown request.
      const always = this.failFor.get(it.recipient.customerId);
      if (always) return { ok: false, error: always };
      this.sentCustomers.push(it.recipient.customerId);
      return { ok: true, providerMessageId: `pm-${it.recipient.customerId}` };
    });
    return out.slice(0, out.length - this.shortBy);
  }
}

describe("send-run — batch sending", () => {
  const BATCHED: SendConfig = { ...DEFAULT_SEND_CONFIG, batchSize: 10 };

  it("sends in chunks of batchSize and records every recipient individually", async () => {
    const store = new BatchStore();
    const s = await runSend(mk(25), store, "camp", hashFor, BATCHED);
    expect(s.sent).toBe(25);
    expect(store.batchCalls.map((c) => c.length)).toEqual([10, 10, 5]); // 3 requests, not 25
    for (let i = 0; i < 25; i++) {
      expect(store.rows.get(`camp:c${i}:email`)?.status).toBe("sent");
    }
  });

  it("leaves NO claimed recipient without an outcome — the tail chunk is always flushed", async () => {
    const store = new BatchStore();
    // 23 with batchSize 10: the last 3 live only in the tail flush after the loop ends.
    await runSend(mk(23), store, "camp", hashFor, BATCHED);
    const stranded = Array.from(store.rows.values()).filter((r) => r.status === "queued");
    expect(stranded).toEqual([]);
  });

  it("a REJECTED chunk falls back to one-by-one so one bad address cannot fail the other nine", async () => {
    const store = new BatchStore();
    store.failBatchWith = { status: 422, message: "invalid email address" }; // recipient-level, not retryable
    store.failFor.set("c3", { status: 422, message: "invalid email address" }); // the actual culprit
    const s = await runSend(mk(10), store, "camp", hashFor, BATCHED);
    expect(s.sent).toBe(9); // nine innocents delivered
    expect(s.failed.invalid_address).toBe(1); // one genuine failure
    expect(store.rows.get("camp:c3:email")?.status).toBe("failed");
    expect(store.rows.get("camp:c0:email")?.status).toBe("sent");
  });

  it("a THROTTLED chunk is retried whole under backoff, then recorded as provider_throttled", async () => {
    const store = new BatchStore();
    store.failBatchWith = { status: 429 }; // retryable, thrown every time
    const s = await runSend(mk(5), store, "camp", hashFor, { ...BATCHED, maxSendAttempts: 2 }, () => 0);
    expect(s.sent).toBe(0);
    expect(s.failed.provider_throttled).toBe(5);
    expect(s.retriedSends).toBe(1); // the REQUEST was retried once, not five recipients separately
    expect(store.batchCalls).toHaveLength(2);
    // Critically NOT the one-by-one fallback: a real provider wall must not be hammered per recipient.
    expect(store.sentCustomers).toEqual([]);
  });

  it("a SHORT batch response fails the missing recipients — it never promotes them to sent", async () => {
    const store = new BatchStore();
    store.shortBy = 2; // adapter returns 8 results for 10 inputs
    const s = await runSend(mk(10), store, "camp", hashFor, BATCHED);
    expect(s.sent).toBe(8);
    expect(s.failed.unknown).toBe(2);
    expect(store.rows.get("camp:c9:email")?.status).toBe("failed");
  });

  it("falls back to the one-at-a-time path when the adapter offers no sendBatch port", async () => {
    const store = new FakeStore(); // no sendBatch — e.g. Mailtrap
    const s = await runSend(mk(5), store, "camp", hashFor, BATCHED);
    expect(s.sent).toBe(5);
    expect(store.sendAttempts).toHaveLength(5); // every send went through the single-send port
  });

  it("suppression is still enforced per recipient inside a batched run", async () => {
    const store = new BatchStore();
    store.suppressed.add("c2");
    const s = await runSend(mk(5), store, "camp", hashFor, BATCHED);
    expect(s.skippedSuppressed).toBe(1);
    expect(s.sent).toBe(4);
    expect(store.batchCalls[0]).not.toContain("c2"); // never handed to the provider
    expect(store.rows.get("camp:c2:email")?.status).toBe("skipped_suppressed");
  });

  it("idempotency survives interruption in a batched run — a re-run sends nobody twice", async () => {
    const store = new BatchStore();
    await runSend(mk(10), store, "camp", hashFor, BATCHED);
    const firstPass = store.sentCustomers.length;
    const second = await runSend(mk(20), store, "camp", hashFor, BATCHED);
    expect(second.skippedAlreadySent).toBe(10);
    expect(second.sent).toBe(10); // only the NEW ten
    expect(store.sentCustomers).toHaveLength(firstPass + 10);
  });
});

describe("send-run — unlimited ceiling + T-43 budget accounting", () => {
  it("an unlimited ceiling never reads the daily counter (nothing to measure against)", async () => {
    const store = new FakeStore();
    let reads = 0;
    store.todaySentCount = async () => {
      reads++;
      return 0;
    };
    const s = await runSend(mk(3), store, "camp", hashFor, DEFAULT_SEND_CONFIG);
    expect(s.sent).toBe(3);
    expect(reads).toBe(0);
    expect(s.deferredDailyLimit).toBe(0);
  });

  it("T-43: a FAILED attempt consumes the budget too, so failures can no longer run past the ceiling", async () => {
    const store = new FakeStore();
    for (const r of mk(10)) store.failFor.set(r.customerId, { status: 500 });
    // Ceiling of 5 with everything failing. Before the fix the budget only moved on success, so all
    // 10 were attempted; now the ceiling stops it at 5 and defers the rest.
    const s = await runSend(mk(10), store, "camp", hashFor, {
      ...DEFAULT_SEND_CONFIG,
      dailyLimit: 5,
      maxConsecutiveFailures: 999, // isolate the budget rule from the wall
    });
    expect(s.attempted).toBe(5);
    expect(s.deferredDailyLimit).toBe(5);
    expect(s.sent).toBe(0);
  });
});
