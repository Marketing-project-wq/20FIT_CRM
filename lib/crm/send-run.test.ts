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
  DEFAULT_SEND_CONFIG,
  type SendPorts,
  type SendRecipient,
  type RenderedMessage,
  type ClaimMeta,
  type RecordOutcome,
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
  sentCustomers: string[] = []; // every customerId send() was actually called for, in order
  failFor = new Map<string, unknown>(); // customerId -> error to throw from send()
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
    const err = this.failFor.get(r.customerId);
    if (err) throw err;
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
