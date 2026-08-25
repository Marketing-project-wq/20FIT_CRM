import { describe, it, expect } from "vitest";
import {
  buildIdempotencyKey,
  classifySendFailure,
  assertHasUnsubscribeLink,
  shouldStopForBounces,
  requiresLargeSendConfirmation,
  runSend,
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
  rows = new Map<string, { status: string; customerId: string }>();
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
    if (row) row.status = outcome.status;
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
      dailyLimit: 1000,
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
