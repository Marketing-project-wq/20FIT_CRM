import { describe, it, expect } from "vitest";
import { hashIdentity } from "./identity-hash";

const SECRET = "test-secret-at-least-16-chars-long";

describe("identity-hash — keyed HMAC of a send destination", () => {
  it("is deterministic for the same (kind, normalized, secret)", () => {
    expect(hashIdentity("email", "john@x.com", SECRET)).toBe(hashIdentity("email", "john@x.com", SECRET));
  });
  it("does NOT contain the raw identity (it is a hash, not the address)", () => {
    const h = hashIdentity("email", "john@x.com", SECRET);
    expect(h).not.toContain("john");
    expect(h).not.toContain("@");
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
  it("lets a bounced address be MATCHED — hashing the same normalized value reproduces the row's hash", () => {
    // The provider reports a bounce for "john@x.com"; we hash it and match identity_hash.
    const stored = hashIdentity("email", "john@x.com", SECRET);
    const fromBounce = hashIdentity("email", "john@x.com", SECRET);
    expect(fromBounce).toBe(stored);
  });
  it("separates kinds and secrets (no collision between phone/email or two keys)", () => {
    expect(hashIdentity("email", "628123", SECRET)).not.toBe(hashIdentity("phone", "628123", SECRET));
    expect(hashIdentity("email", "john@x.com", SECRET)).not.toBe(
      hashIdentity("email", "john@x.com", "another-secret-16-chars-xx"),
    );
  });
});
