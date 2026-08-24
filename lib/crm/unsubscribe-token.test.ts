import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "test-secret-at-least-16-chars-long";
const OTHER = "different-secret-also-16-plus-chars";

describe("unsubscribe token — sign/verify round-trip", () => {
  it("verifies a token it just signed", () => {
    const tok = signUnsubscribeToken({ customerId: "cust-123", kind: "email" }, SECRET);
    expect(verifyUnsubscribeToken(tok, SECRET)).toEqual({ customerId: "cust-123", kind: "email" });
  });

  it("carries the channel (phone vs email) distinctly", () => {
    const email = signUnsubscribeToken({ customerId: "c", kind: "email" }, SECRET);
    const phone = signUnsubscribeToken({ customerId: "c", kind: "phone" }, SECRET);
    expect(email).not.toBe(phone);
    expect(verifyUnsubscribeToken(phone, SECRET)?.kind).toBe("phone");
  });

  it("does NOT put the customer id in clear reversible-by-eye form is not required, but the payload is recoverable only WITH a valid signature", () => {
    // The point of the test below (forgery) is the real guarantee; this just documents intent.
    const tok = signUnsubscribeToken({ customerId: "abc", kind: "email" }, SECRET);
    expect(tok).toContain(".");
  });
});

describe("unsubscribe token — cannot unsubscribe someone else (unguessable)", () => {
  it("rejects a token signed with a different secret", () => {
    const tok = signUnsubscribeToken({ customerId: "victim", kind: "email" }, OTHER);
    expect(verifyUnsubscribeToken(tok, SECRET)).toBeNull();
  });

  it("rejects a token whose payload was tampered (forge another customer)", () => {
    const tok = signUnsubscribeToken({ customerId: "me", kind: "email" }, SECRET);
    const [, sig] = tok.split(".");
    // Swap the payload for a different customer, keep the old signature.
    const forgedPayload = Buffer.from(JSON.stringify({ c: "victim", k: "email" }), "utf8")
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const forged = `${forgedPayload}.${sig}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("rejects a token with a stripped/empty signature", () => {
    const tok = signUnsubscribeToken({ customerId: "me", kind: "email" }, SECRET);
    const [payload] = tok.split(".");
    expect(verifyUnsubscribeToken(payload, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.`, SECRET)).toBeNull();
  });
});

describe("unsubscribe token — malformed input is a quiet null, never a throw", () => {
  for (const bad of ["", ".", "..", "no-dot", "a.b.c", "🙂.🙂"]) {
    it(`returns null for ${JSON.stringify(bad)}`, () => {
      expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
    });
  }

  it("rejects a valid signature over a payload of the wrong shape", () => {
    // Sign a payload that lacks kind — must fail shape check even though the HMAC matches.
    const badPayload = Buffer.from(JSON.stringify({ c: "x" }), "utf8")
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    // Re-create the signature the same way sign() would, over the bad payload (mirror the HMAC).
    const sig = createHmac("sha256", SECRET).update(badPayload).digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyUnsubscribeToken(`${badPayload}.${sig}`, SECRET)).toBeNull();
  });
});
