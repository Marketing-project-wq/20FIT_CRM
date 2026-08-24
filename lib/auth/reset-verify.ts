/**
 * Password-reset failure classification — PURE, client+server safe, so the form and its tests
 * agree on how a failure is described. Written after a real incident (24 Aug 2026): a reset where
 * verifyOtp SUCCEEDED (POST /verify → 200) but updateUser then FAILED (PUT /user → 422, new password
 * rejected), and every retry re-ran verifyOtp against the now-consumed token (→ 403). The single
 * generic "wrong or expired code" message hid THREE different states for days.
 *
 * The states have DIFFERENT next actions (this is the whole point):
 *   - verify_failed    → the code was WRONG → re-check the digits (still within the validity window).
 *   - code_expired     → the code was right-shaped but the validity window has elapsed → request a NEW
 *                        code. GoTrue merges wrong-and-expired into one 403/otp_expired response and
 *                        cannot split them, so we infer expiry from elapsed-time-since-send (the only
 *                        signal available client-side) rather than from the error itself.
 *   - code_already_used→ verifyOtp already succeeded THIS session; the token is spent. Do NOT re-enter
 *                        the code — the session is live; just set the password. (Client STATE, not the
 *                        error, is what tells these apart from a wrong code.)
 *   - password_rejected→ the code was fine; the NEW PASSWORD was rejected (must differ from the old /
 *                        meet the policy). Change the password and save again — no new code needed.
 */

export type ResetFailure =
  | "verify_failed"
  | "code_expired"
  | "code_already_used"
  | "password_rejected";

export interface AuthErrorShape {
  status?: number;
  code?: string;
  message?: string;
}

/** GoTrue signals an expired/invalid recovery OTP as HTTP 403 and/or code `otp_expired`. It does
 *  NOT distinguish "wrong digits" from "expired" — both come back the same, so the copy must cover
 *  both and offer "request a new code". `true` = this looks like a spent/expired/wrong OTP. */
export function isSpentOrInvalidOtp(err: AuthErrorShape | null | undefined): boolean {
  if (!err) return false;
  if (err.status === 403) return true;
  const code = (err.code ?? "").toLowerCase();
  if (code.includes("otp_expired") || code.includes("expired") || code.includes("invalid")) return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("expired") || msg.includes("invalid") || msg.includes("token");
}

/** GoTrue returns 422 when updateUser's new password is rejected. Best-effort kind so the copy can
 *  be specific; the raw server message is also surfaced so nothing is hidden. */
export type PasswordRejectKind = "same_as_old" | "too_weak" | "other";

export function classifyPasswordReject(err: AuthErrorShape | null | undefined): PasswordRejectKind {
  const msg = (err?.message ?? "").toLowerCase();
  if (msg.includes("different from the old") || msg.includes("should be different") || msg.includes("same"))
    return "same_as_old";
  if (msg.includes("at least") || msg.includes("weak") || msg.includes("characters") || msg.includes("short"))
    return "too_weak";
  return "other";
}

/**
 * Decide the failure state from (a) whether verifyOtp already succeeded this session, (b) which step
 * failed, and (c) whether the validity window has elapsed since the code was sent. This is the logic
 * the form drives its message + next-step off. Pure and total.
 *
 * Precedence on the verify step: a spent token (alreadyVerified) is reported first because the form's
 * verify-once guard means we should never even reach verify in that state; then expiry (elapsed >
 * window); otherwise a plain wrong code. `likelyExpired` defaults false so callers that don't track
 * time still get sane behaviour.
 */
export function classifyResetFailure(args: {
  alreadyVerified: boolean;
  step: "verify" | "update";
  likelyExpired?: boolean;
}): ResetFailure {
  if (args.step === "update") return "password_rejected";
  // step === "verify"
  if (args.alreadyVerified) return "code_already_used";
  return args.likelyExpired ? "code_expired" : "verify_failed";
}
