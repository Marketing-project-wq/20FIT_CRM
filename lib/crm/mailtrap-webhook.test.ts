import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifyWebhookSignature,
  mapWebhookEvent,
  parseWebhookEvents,
  readSignatureHeader,
  isEventTooOld,
} from "./mailtrap-webhook";

const SECRET = "webhook-secret-at-least-16-chars";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

describe("mailtrap-webhook — signature verification (untrusted input, fail-closed)", () => {
  it("accepts a correct HMAC-SHA256 signature", () => {
    const body = '{"events":[]}';
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });
  it("rejects a wrong signature", () => {
    expect(verifyWebhookSignature('{"events":[]}', sign("tampered"), SECRET)).toBe(false);
  });
  it("rejects when the secret is unset (never trusts the payload)", () => {
    const body = '{"events":[]}';
    expect(verifyWebhookSignature(body, sign(body), null)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), "")).toBe(false);
  });
  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature('{"events":[]}', null, SECRET)).toBe(false);
  });
  it("rejects a length-mismatched signature without throwing", () => {
    expect(verifyWebhookSignature('{"events":[]}', "short", SECRET)).toBe(false);
  });
});

describe("mailtrap-webhook — reads BOTH signature header names (Mailtrap-Signature / X-Mt-Signature)", () => {
  // Fetch headers are case-insensitive; simulate a case-insensitive getter over a header map.
  const getter = (headers: Record<string, string>) => (name: string) =>
    headers[name.toLowerCase()] ?? null;

  it("accepts Mailtrap-Signature", () => {
    expect(readSignatureHeader(getter({ "mailtrap-signature": "abc" }))).toBe("abc");
  });
  it("accepts X-Mt-Signature (the CVE-2026-45755 / Symfony-bridge name)", () => {
    expect(readSignatureHeader(getter({ "x-mt-signature": "def" }))).toBe("def");
  });
  it("returns null when neither is present (→ verification fails closed)", () => {
    expect(readSignatureHeader(getter({ "x-other": "z" }))).toBeNull();
  });
});

describe("mailtrap-webhook — event age (anti-replay)", () => {
  const now = Date.parse("2026-08-24T16:00:00.000Z");
  it("accepts a fresh event", () => {
    expect(isEventTooOld("2026-08-24T15:58:00.000Z", now, 15)).toBe(false);
  });
  it("rejects an event older than the window", () => {
    expect(isEventTooOld("2026-08-24T15:40:00.000Z", now, 15)).toBe(true);
  });
  it("does not judge a missing/invalid timestamp as old (idempotency guards those)", () => {
    expect(isEventTooOld(null, now, 15)).toBe(false);
    expect(isEventTooOld("not-a-date", now, 15)).toBe(false);
  });
});

describe("mailtrap-webhook — event → cycle-column mapping (never guesses)", () => {
  it("maps delivery/bounce/spam to terminal statuses", () => {
    expect(mapWebhookEvent("delivery")).toEqual({ column: "delivered_at", status: "delivered", failureCause: null });
    expect(mapWebhookEvent("bounce")).toEqual({ column: "bounced_at", status: "bounced", failureCause: "hard_bounce" });
    expect(mapWebhookEvent("spam")).toEqual({ column: "complained_at", status: "complained", failureCause: null });
  });
  it("maps open/click/unsubscribe to a column without changing status", () => {
    expect(mapWebhookEvent("open")?.status).toBeNull();
    expect(mapWebhookEvent("click")?.column).toBe("clicked_at");
    expect(mapWebhookEvent("unsubscribe")?.column).toBe("unsubscribed_at");
  });
  it("IGNORES transient/unknown events (soft_bounce, reject, garbage) — no status change on a guess", () => {
    expect(mapWebhookEvent("soft_bounce")).toBeNull();
    expect(mapWebhookEvent("reject")).toBeNull();
    expect(mapWebhookEvent("whatever")).toBeNull();
  });
  it("is case/whitespace tolerant", () => {
    expect(mapWebhookEvent("  Delivered ")?.column).toBe("delivered_at");
  });
});

describe("mailtrap-webhook — payload parsing (shape-drift tolerant)", () => {
  it("extracts events with message_id, email, and an ISO timestamp from a unix seconds field", () => {
    const parsed = parseWebhookEvents({
      events: [{ event: "bounce", message_id: "pm-1", email: "a@x.com", timestamp: 1756051200 }],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].messageId).toBe("pm-1");
    expect(parsed[0].email).toBe("a@x.com");
    expect(parsed[0].timestampIso).toMatch(/^20\d\d-\d\d-\d\dT/);
  });
  it("returns [] for a non-object / missing events / non-array", () => {
    expect(parseWebhookEvents(null)).toEqual([]);
    expect(parseWebhookEvents({})).toEqual([]);
    expect(parseWebhookEvents({ events: "nope" })).toEqual([]);
  });
  it("skips malformed entries (no event name)", () => {
    expect(parseWebhookEvents({ events: [{ message_id: "x" }, { event: "open" }] })).toHaveLength(1);
  });
});
