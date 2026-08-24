import { describe, it, expect } from "vitest";
import {
  isSpentOrInvalidOtp,
  classifyPasswordReject,
  classifyResetFailure,
} from "./reset-verify";

describe("reset-verify — spent/invalid OTP detection (GoTrue merges wrong & expired)", () => {
  it("treats HTTP 403 as spent/invalid (the retry-after-consume case from the incident)", () => {
    expect(isSpentOrInvalidOtp({ status: 403 })).toBe(true);
  });
  it("treats the otp_expired code as spent/invalid", () => {
    expect(isSpentOrInvalidOtp({ code: "otp_expired", message: "Token has expired or is invalid" })).toBe(true);
  });
  it("is false for a null / shapeless error", () => {
    expect(isSpentOrInvalidOtp(null)).toBe(false);
    expect(isSpentOrInvalidOtp({})).toBe(false);
  });
});

describe("reset-verify — password-reject classification (updateUser 422)", () => {
  it("recognises 'must differ from the old password' (the incident's 422)", () => {
    expect(classifyPasswordReject({ message: "New password should be different from the old password." })).toBe("same_as_old");
  });
  it("recognises a weak/too-short password", () => {
    expect(classifyPasswordReject({ message: "Password should be at least 10 characters" })).toBe("too_weak");
  });
  it("falls back to 'other' for an unknown reason", () => {
    expect(classifyPasswordReject({ message: "something else" })).toBe("other");
  });
});

describe("reset-verify — the distinct failure states, by step + session state + elapsed time", () => {
  it("update-step failure is ALWAYS password_rejected (code was already accepted)", () => {
    expect(classifyResetFailure({ alreadyVerified: true, step: "update" })).toBe("password_rejected");
  });
  it("update-step failure stays password_rejected even if the window has elapsed", () => {
    // The code was already accepted; the elapsed window is irrelevant to a password rejection.
    expect(classifyResetFailure({ alreadyVerified: true, step: "update", likelyExpired: true })).toBe(
      "password_rejected",
    );
  });
  it("verify-step failure WITHIN the window is verify_failed (a plain wrong code)", () => {
    expect(classifyResetFailure({ alreadyVerified: false, step: "verify" })).toBe("verify_failed");
    expect(classifyResetFailure({ alreadyVerified: false, step: "verify", likelyExpired: false })).toBe(
      "verify_failed",
    );
  });
  it("verify-step failure AFTER the window elapsed is code_expired (request a new code)", () => {
    expect(classifyResetFailure({ alreadyVerified: false, step: "verify", likelyExpired: true })).toBe(
      "code_expired",
    );
  });
  it("verify-step failure AFTER a prior success is code_already_used (token spent this session)", () => {
    // This is the incident: retrying verify after the first 200 → 403. Must NOT read as 'wrong code'.
    expect(classifyResetFailure({ alreadyVerified: true, step: "verify" })).toBe("code_already_used");
  });
  it("a spent token outranks an elapsed window (verify-once should never even reach here)", () => {
    expect(classifyResetFailure({ alreadyVerified: true, step: "verify", likelyExpired: true })).toBe(
      "code_already_used",
    );
  });
});
