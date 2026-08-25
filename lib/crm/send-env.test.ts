import { describe, it, expect } from "vitest";
import { missingSendEnv, classifySendThrow, REQUIRED_SEND_VARS } from "./send-env";

/**
 * Locks the T-30 fix: the send env pre-check reports ALL missing vars at once (not just the first),
 * treats a too-short secret as missing, and the throw classifier stays PII-free.
 */
describe("send-env pre-check (T-30)", () => {
  const good = {
    UNSUBSCRIBE_TOKEN_SECRET: "x".repeat(32),
    MAILTRAP_API_TOKEN: "tok",
    MAILTRAP_FROM: "crm@20fit.id",
  } as unknown as NodeJS.ProcessEnv;

  it("all present → nothing missing", () => {
    expect(missingSendEnv(good)).toEqual([]);
  });

  it("reports EVERY missing var at once, not just the first", () => {
    const names = missingSendEnv({} as NodeJS.ProcessEnv).map((v) => v.name);
    // All required vars come back together — the whole point (owner sets them in one pass).
    expect(names).toEqual(REQUIRED_SEND_VARS.map((v) => v.name));
    expect(names).toContain("UNSUBSCRIBE_TOKEN_SECRET");
    expect(names).toContain("MAILTRAP_API_TOKEN");
    expect(names).toContain("MAILTRAP_FROM");
  });

  it("treats a too-short UNSUBSCRIBE_TOKEN_SECRET as missing (the helpers reject < 16)", () => {
    const names = missingSendEnv({ ...good, UNSUBSCRIBE_TOKEN_SECRET: "short" } as unknown as NodeJS.ProcessEnv).map((v) => v.name);
    expect(names).toEqual(["UNSUBSCRIBE_TOKEN_SECRET"]);
  });

  it("blank/whitespace counts as missing", () => {
    const names = missingSendEnv({ ...good, MAILTRAP_FROM: "   " } as unknown as NodeJS.ProcessEnv).map((v) => v.name);
    expect(names).toEqual(["MAILTRAP_FROM"]);
  });
});

describe("classifySendThrow — PII-free cause", () => {
  it("names the missing secret cause", () => {
    expect(classifySendThrow(new Error("UNSUBSCRIBE_TOKEN_SECRET is not set (or too short) — cannot hash send identities")))
      .toBe("missing_env:UNSUBSCRIBE_TOKEN_SECRET");
  });

  it("names the no-template cause", () => {
    expect(classifySendThrow(new Error('No active email template for key "x".'))).toBe("no_active_template");
  });

  it("collapses anything unknown to a generic marker (never leaks a raw message that could carry PII)", () => {
    expect(classifySendThrow(new Error("SMTP 550 rejected recipient john@example.com"))).toBe("unexpected_error");
    expect(classifySendThrow("weird")).toBe("unexpected_error");
  });
});
