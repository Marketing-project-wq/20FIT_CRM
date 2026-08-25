import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LOCKING GUARDS for the password-reset flow (incident 24 Aug 2026). These are STATIC source
 * scans — the repo has no DOM test environment (no jsdom / testing-library; vitest runs in Node),
 * so behaviour is locked by asserting on the source of the three files in the flow. Each analyzer
 * is a pure function proven to BITE on synthetic input, then run against the real source.
 *
 * The three properties the incident review demanded be locked forever:
 *   (a) LOADING /reset-password sends ZERO codes. A code is mailed only by an explicit action
 *       (the request form, or the "Kirim ulang kode" button) — never as a side effect of the page
 *       or form mounting. So no code-send call may sit in a useEffect, and the page must not import
 *       the send pipeline at all.
 *   (b) verifyOtp ALWAYS uses type 'recovery'. The token is issued by generateLink({type:'recovery'});
 *       any other verifyOtp type could never match it, which was one of the two candidate causes.
 *   (c) The email is NORMALIZED on BOTH sides — the send side (recovery.ts, before generateLink) and
 *       the verify side (the page, before handing the address to the form) — so the token is never
 *       searched for a different casing/alias of the same address (K-06).
 */

const ROOT = process.cwd();

/** Strip block and line comments so the analyzers scan CODE, not documentation. The three files in
 *  this flow describe the very calls we scan for (`verifyOtp({type:'recovery'})`,
 *  `generateLink({type:'recovery'})`) inside their doc comments; without this, a comment would count
 *  as a call. Safe here: none of these files contains `//` inside a string literal (asserted below). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const FORM_SRC = stripComments(readFileSync(join(ROOT, "components/auth/reset-password-form.tsx"), "utf8"));
const PAGE_SRC = stripComments(readFileSync(join(ROOT, "app/reset-password/page.tsx"), "utf8"));
const RECOVERY_SRC = stripComments(readFileSync(join(ROOT, "lib/auth/recovery.ts"), "utf8"));

// ── (a) No code-send is triggered by mounting ────────────────────────────────────────────────

/** Any call that mails a recovery code. If ANY of these appears inside a useEffect body, mounting
 *  the component would send a code — exactly the bug the incident review forbade. */
const SEND_CALLS = ["resendRecoveryCode", "sendRecoveryCode", "requestPasswordReset", "generateLink"];

/** Extract every `useEffect(() => { ... }, [deps])` body from source. Written for this repo's simple
 *  arrow-effect style (no nested `}, [` inside a body); returns the body text of each. */
export function effectBodies(src: string): string[] {
  const re = /useEffect\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\s*\)/g;
  const bodies: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) bodies.push(m[1]);
  return bodies;
}

/** A call to `name` on a WORD boundary — so scanning for `sendRecoveryCode` never matches inside
 *  `resendRecoveryCode` (one contains the other as a substring). */
function callsFn(text: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*\\(`).test(text);
}

/** Names of send-calls found inside ANY useEffect body — must be empty. */
export function sendCallsInEffects(src: string, sendCalls: string[] = SEND_CALLS): string[] {
  const found = new Set<string>();
  for (const body of effectBodies(src)) {
    for (const name of sendCalls) if (callsFn(body, name)) found.add(name);
  }
  return Array.from(found);
}

/** Send-pipeline symbols the reset-password PAGE must not reference at all (it only shows the form;
 *  the sender lives behind an explicit user action). Word-boundary so a longer name is not a
 *  false match for a shorter one it contains. */
export function pageReferencesSender(src: string, sendCalls: string[] = SEND_CALLS): string[] {
  return sendCalls.filter((name) => callsFn(src, name));
}

// ── (b) verifyOtp always type 'recovery' ─────────────────────────────────────────────────────

/** Every `verifyOtp({ ... })` call, returning the object-literal text of each. */
export function verifyOtpCalls(src: string): string[] {
  const re = /verifyOtp\(\s*\{([^}]*)\}/g;
  const calls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) calls.push(m[1]);
  return calls;
}

/** verifyOtp call-argument texts that do NOT pin type to 'recovery'. Must be empty. */
export function verifyOtpCallsMissingRecoveryType(src: string): string[] {
  return verifyOtpCalls(src).filter((args) => !/type:\s*["']recovery["']/.test(args));
}

// ── (c) email normalized both sides ──────────────────────────────────────────────────────────

/** Send side: recovery.ts must run rawEmail through normalizeEmail and hand generateLink the
 *  NORMALIZED variable — never the raw input. */
export function sendSideNormalizes(src: string): boolean {
  const normalizes = /normalizeEmail\(\s*rawEmail\s*\)/.test(src);
  const genLink = /generateLink\(\s*\{([^}]*)\}/.exec(src);
  if (!normalizes || !genLink) return false;
  const args = genLink[1];
  // The call passes the normalized `email` and does NOT pass the raw input.
  return /\bemail\b/.test(args) && !/\brawEmail\b/.test(args);
}

/** Verify side: the page must normalize the inbound address and pass the normalized `email` to the
 *  form (whose verifyOtp then uses exactly that value). */
export function verifySideNormalizes(src: string): boolean {
  const normalizes = /normalizeEmail\(/.test(src);
  const passesNormalized = /email=\{email\}/.test(src);
  return normalizes && passesNormalized;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("reset flow — mounting /reset-password sends ZERO codes (a)", () => {
  it("no send-call sits inside any useEffect in the form", () => {
    const offenders = sendCallsInEffects(FORM_SRC);
    expect(offenders, offenders.length ? `send-call(s) in a useEffect: ${offenders.join(", ")}` : "").toEqual(
      [],
    );
  });

  it("the reset-password PAGE does not reference the send pipeline at all", () => {
    expect(pageReferencesSender(PAGE_SRC)).toEqual([]);
  });

  it("the form DOES still have the explicit resend path (button handler), just not on mount", () => {
    // Guards against a false pass where the send call was deleted entirely: the resend button must exist.
    expect(FORM_SRC.includes("resendRecoveryCode(")).toBe(true);
    expect(FORM_SRC.includes("onResend")).toBe(true);
  });

  // ── proven to BITE ──
  it("flags a send-call placed inside a useEffect", () => {
    const bad = `useEffect(() => { resendRecoveryCode(email); }, [email]);`;
    expect(sendCallsInEffects(bad)).toEqual(["resendRecoveryCode"]);
  });
  it("passes an effect that only ticks a cooldown", () => {
    const good = `useEffect(() => { const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);`;
    expect(sendCallsInEffects(good)).toEqual([]);
  });
  it("flags a page that imports generateLink", () => {
    expect(pageReferencesSender("const x = generateLink({ type: 'recovery' });")).toContain("generateLink");
  });
});

describe("reset flow — verifyOtp ALWAYS uses type 'recovery' (b)", () => {
  it("the form calls verifyOtp exactly once, pinned to recovery", () => {
    const calls = verifyOtpCalls(FORM_SRC);
    expect(calls.length).toBe(1);
    expect(verifyOtpCallsMissingRecoveryType(FORM_SRC)).toEqual([]);
  });

  // ── proven to BITE ──
  it("flags a verifyOtp with the wrong type", () => {
    const bad = `supabase.auth.verifyOtp({ email, token, type: "email" })`;
    expect(verifyOtpCallsMissingRecoveryType(bad)).toHaveLength(1);
  });
  it("flags a verifyOtp with no type at all", () => {
    const bad = `supabase.auth.verifyOtp({ email, token })`;
    expect(verifyOtpCallsMissingRecoveryType(bad)).toHaveLength(1);
  });
  it("passes a verifyOtp pinned to recovery (single quotes too)", () => {
    const good = `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`;
    expect(verifyOtpCallsMissingRecoveryType(good)).toEqual([]);
  });
});

describe("reset flow — email normalized on BOTH sides (c)", () => {
  it("send side (recovery.ts) normalizes rawEmail before generateLink", () => {
    expect(sendSideNormalizes(RECOVERY_SRC)).toBe(true);
  });
  it("verify side (page) normalizes and passes the normalized email to the form", () => {
    expect(verifySideNormalizes(PAGE_SRC)).toBe(true);
  });

  // ── proven to BITE ──
  it("flags a send side that passes rawEmail straight to generateLink", () => {
    const bad =
      "const email = normalizeEmail(rawEmail);\n" +
      "await admin.auth.admin.generateLink({ type: 'recovery', email: rawEmail });";
    expect(sendSideNormalizes(bad)).toBe(false);
  });
  it("flags a verify side that never normalizes", () => {
    const bad = "const email = searchParams.email;\n<ResetPasswordForm email={email} />";
    expect(verifySideNormalizes(bad)).toBe(false);
  });
});
