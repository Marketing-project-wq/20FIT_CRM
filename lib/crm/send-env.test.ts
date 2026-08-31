import { describe, it, expect } from "vitest";
import { missingSendEnv, classifySendThrow, REQUIRED_SEND_VARS, hostOf, unsubscribeHostServable } from "./send-env";

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

describe("unsubscribe host check (owner request 25 Aug — a dead unsubscribe link is worse than not sending)", () => {
  it("hostOf strips scheme/port/path", () => {
    expect(hostOf("https://crm.20fit.id/unsubscribe?token=x")).toBe("crm.20fit.id");
    expect(hostOf("https://20fitcrm-production.up.railway.app")).toBe("20fitcrm-production.up.railway.app");
    expect(hostOf("crm.20fit.id:443")).toBe("crm.20fit.id");
    expect(hostOf(undefined)).toBe(null);
    expect(hostOf("")).toBe(null);
  });

  it("REFUSES when the unsubscribe host ≠ the serving host (the live crm.20fit.id-vs-railway case)", () => {
    // NEXT_PUBLIC_APP_URL still crm.20fit.id (DNS not resolving) but served from the railway host.
    const r = unsubscribeHostServable("https://crm.20fit.id", "20fitcrm-production.up.railway.app");
    expect(r.ok).toBe(false);
    expect(r.linkHost).toBe("crm.20fit.id");
    expect(r.servingHost).toBe("20fitcrm-production.up.railway.app");
  });

  it("also refuses when the env is UNSET (default crm.20fit.id) but served elsewhere", () => {
    expect(unsubscribeHostServable(undefined, "20fitcrm-production.up.railway.app").ok).toBe(false);
  });

  it("ALLOWS when they match (env set to the serving host, or DNS resolved)", () => {
    expect(unsubscribeHostServable("https://20fitcrm-production.up.railway.app", "20fitcrm-production.up.railway.app").ok).toBe(true);
    expect(unsubscribeHostServable("https://crm.20fit.id", "crm.20fit.id:443").ok).toBe(true); // port ignored
  });

  it("does NOT block when the serving host is unknown (best-effort, never refuse on 'unknown')", () => {
    expect(unsubscribeHostServable("https://crm.20fit.id", undefined).ok).toBe(true);
    expect(unsubscribeHostServable("https://crm.20fit.id", "").ok).toBe(true);
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

  it("names an invalid recipient id (uuid) cause — the 28 Aug email-list failures were 'unexpected_error'", () => {
    // A raw/synthetic recipient id (an address not resolved to a real master_customer uuid) throws this
    // at the crm_message_log insert. It must have its own cause, not be swallowed as 'unexpected_error'.
    expect(classifySendThrow(new Error('invalid input syntax for type uuid: "manual:tifany@20fit.id"')))
      .toBe("invalid_recipient_id");
  });

  it("collapses anything unknown to a generic marker (never leaks a raw message that could carry PII)", () => {
    expect(classifySendThrow(new Error("SMTP 550 rejected recipient john@example.com"))).toBe("unexpected_error");
    expect(classifySendThrow("weird")).toBe("unexpected_error");
  });
});
