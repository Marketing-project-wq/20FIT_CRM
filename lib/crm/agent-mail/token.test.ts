import { describe, it, expect } from "vitest";
import { signAgentToken, verifyAgentToken, bearerToken, AGENT_TOKEN_TTL_MS } from "./token";

const SECRET = "x".repeat(40);
const base = { userId: "11111111-1111-4111-8111-111111111111", email: "ops@20fit.id", issuedAt: 1_760_000_000_000 };

describe("Agent Mail token", () => {
  it("round-trips a signed token", () => {
    const t = signAgentToken(base, SECRET);
    expect(t.startsWith("am1.")).toBe(true);
    expect(verifyAgentToken(t, SECRET, base.issuedAt + 1000)).toEqual(base);
  });
  it("rejects a token signed with another secret", () => {
    const t = signAgentToken(base, SECRET);
    expect(verifyAgentToken(t, "y".repeat(40), base.issuedAt)).toBeNull();
  });
  it("rejects a tampered payload (cannot swap in another user)", () => {
    const t = signAgentToken(base, SECRET);
    const other = signAgentToken({ ...base, userId: "22222222-2222-4222-8222-222222222222" }, SECRET);
    const forged = [t.split(".")[0], other.split(".")[1], t.split(".")[2]].join(".");
    expect(verifyAgentToken(forged, SECRET, base.issuedAt)).toBeNull();
  });
  it("expires after the TTL", () => {
    const t = signAgentToken(base, SECRET);
    expect(verifyAgentToken(t, SECRET, base.issuedAt + AGENT_TOKEN_TTL_MS + 1)).toBeNull();
  });
  it("fails closed without a secret", () => {
    const t = signAgentToken(base, SECRET);
    expect(verifyAgentToken(t, "", base.issuedAt)).toBeNull();
    expect(() => signAgentToken(base, "")).toThrow();
  });
  it("reads the bearer header", () => {
    expect(bearerToken("Bearer am1.a.b")).toBe("am1.a.b");
    expect(bearerToken("bearer   am1.a.b ")).toBe("am1.a.b");
    expect(bearerToken("Basic xyz")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
