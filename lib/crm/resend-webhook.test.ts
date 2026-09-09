import { describe, it, expect } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import {
  verifyResendSignature,
  isSvixTimestampTooOld,
  mapResendEvent,
  parseResendEvent,
} from "./resend-webhook";

/**
 * Resend webhook is UNTRUSTED input. Verification is mandatory (an unverified route is a
 * suppression-poisoning door). These lock the Svix scheme, the sent→delivered/bounced/complained
 * mapping, the soft-bounce exclusion, and the timestamp replay guard.
 */

// Build a valid Svix signature the way Resend/Svix does, to prove the verifier accepts a genuine one.
function sign(rawBody: string, id: string, timestamp: string, keyBytes: Buffer): { secret: string; header: string } {
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const sig = createHmac("sha256", keyBytes).update(signedContent).digest("base64");
  return { secret: `whsec_${keyBytes.toString("base64")}`, header: `v1,${sig}` };
}

describe("verifyResendSignature (Svix)", () => {
  const keyBytes = randomBytes(24);
  const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-09T10:00:00.000Z", data: { email_id: "e1" } });
  const id = "msg_2abc";
  const timestamp = "1757412000";

  it("accepts a genuine signature", () => {
    const { secret, header } = sign(body, id, timestamp, keyBytes);
    expect(verifyResendSignature(body, { id, timestamp, signature: header }, secret)).toBe(true);
  });

  it("accepts when the header carries multiple space-separated v1 tokens (any match wins)", () => {
    const { secret, header } = sign(body, id, timestamp, keyBytes);
    const multi = `v1,not_the_right_one ${header}`;
    expect(verifyResendSignature(body, { id, timestamp, signature: multi }, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const { secret, header } = sign(body, id, timestamp, keyBytes);
    expect(verifyResendSignature(body + "x", { id, timestamp, signature: header }, secret)).toBe(false);
  });

  it("rejects a wrong secret, and fails closed on any missing header or secret", () => {
    const { header } = sign(body, id, timestamp, keyBytes);
    expect(verifyResendSignature(body, { id, timestamp, signature: header }, `whsec_${randomBytes(24).toString("base64")}`)).toBe(false);
    expect(verifyResendSignature(body, { id, timestamp, signature: header }, null)).toBe(false);
    expect(verifyResendSignature(body, { id: null, timestamp, signature: header }, `whsec_x`)).toBe(false);
    expect(verifyResendSignature(body, { id, timestamp, signature: null }, `whsec_x`)).toBe(false);
  });
});

describe("isSvixTimestampTooOld (replay)", () => {
  const now = Date.parse("2026-09-09T10:00:00.000Z");
  it("accepts a fresh timestamp, rejects an old one and a malformed one", () => {
    expect(isSvixTimestampTooOld(String(Math.floor(now / 1000)), now)).toBe(false);
    expect(isSvixTimestampTooOld(String(Math.floor(now / 1000) - 600), now)).toBe(true); // 10 min old
    expect(isSvixTimestampTooOld(null, now)).toBe(true);
    expect(isSvixTimestampTooOld("not-a-number", now)).toBe(true);
  });
});

describe("mapResendEvent", () => {
  it("maps the sending lifecycle to the shared effect vocabulary", () => {
    expect(mapResendEvent("email.delivered")).toEqual({ column: "delivered_at", status: "delivered", failureCause: null });
    expect(mapResendEvent("email.bounced")).toEqual({ column: "bounced_at", status: "bounced", failureCause: "hard_bounce" });
    expect(mapResendEvent("email.complained")).toEqual({ column: "complained_at", status: "complained", failureCause: null });
    expect(mapResendEvent("email.opened")).toEqual({ column: "opened_at", status: null, failureCause: null });
    expect(mapResendEvent("email.clicked")).toEqual({ column: "clicked_at", status: null, failureCause: null });
  });
  it("IGNORES a soft bounce (never auto-suppress on a transient failure)", () => {
    expect(mapResendEvent("email.bounced", "soft")).toBeNull();
    expect(mapResendEvent("email.bounced", "hard")).toEqual({ column: "bounced_at", status: "bounced", failureCause: "hard_bounce" });
  });
  it("ignores email.sent (status/sent_at are stamped at send, not from a webhook) and unknown types", () => {
    expect(mapResendEvent("email.sent")).toBeNull();
    expect(mapResendEvent("email.delivery_delayed")).toBeNull();
    expect(mapResendEvent("contact.created")).toBeNull();
  });
});

describe("parseResendEvent", () => {
  it("extracts type, email_id, first recipient, created_at, bounce type", () => {
    const ev = parseResendEvent({
      type: "email.bounced",
      created_at: "2026-09-09T10:00:00.000Z",
      data: { email_id: "e-9", to: ["a@x.com", "b@x.com"], bounce: { type: "hard" } },
    });
    expect(ev).toEqual({ type: "email.bounced", messageId: "e-9", email: "a@x.com", timestampIso: "2026-09-09T10:00:00.000Z", bounceType: "hard" });
  });
  it("tolerates flat bounce_type and a string 'to', and returns null for a shapeless body", () => {
    expect(parseResendEvent({ type: "email.bounced", data: { bounce_type: "soft", to: "one@x.com" } })?.bounceType).toBe("soft");
    expect(parseResendEvent({ type: "email.bounced", data: { to: "one@x.com" } })?.email).toBe("one@x.com");
    expect(parseResendEvent(null)).toBeNull();
    expect(parseResendEvent({ nope: 1 })).toBeNull();
  });
});
