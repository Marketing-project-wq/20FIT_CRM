"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { resendRecoveryCode, logResetFailure } from "@/app/forgot-password/actions";
import { useI18n } from "@/components/i18n/lang-provider";
import { classifyPasswordReject, classifyResetFailure } from "@/lib/auth/reset-verify";

const MIN_PASSWORD = 8;
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;

/**
 * Reset password by entering the six-digit CODE mailed via Mailtrap (see lib/auth/recovery).
 *
 * VERIFY EXACTLY ONCE (incident 24 Aug 2026). verifyOtp({type:'recovery'}) CONSUMES the token: on
 * success it establishes a session AND clears the recovery token. So a downstream updateUser failure
 * must NOT trigger a re-verify — the token is already spent, and re-verifying returns 403, which the
 * old code showed as "wrong code" forever. Once verified, `verifiedRef` is set and retries call ONLY
 * updateUser against the live session. The three failure states get three messages with three
 * different next actions (classifyResetFailure). Every failure is also logged server-side
 * (logResetFailure → login.password_reset_failed) so the next occurrence is visible in the log.
 *
 * The email is passed in already-normalized by the server page (K-06), and verifyOtp always uses
 * that same normalized email — the send side normalizes identically, so the token is never searched
 * for a different form of the address.
 */
type Phase = "ready" | "done";

export function ResetPasswordForm({
  email,
  validityLabel,
  validityMinutes,
}: {
  email: string | null;
  validityLabel: string;
  validityMinutes: number;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("ready");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  // The token is consumed by the FIRST successful verifyOtp; after that, never verify again — just
  // retry updateUser on the live session. This ref is the whole fix for the "403 forever" loop.
  const verifiedRef = useRef(false);
  const [codeAccepted, setCodeAccepted] = useState(false);
  // When the current code was sent. A code was just mailed when this page loaded (the request action
  // redirected straight here), so the initial value is "now". Updated on every explicit resend. Used
  // ONLY to infer expiry: GoTrue returns the same 403 for a wrong code and an expired one, so elapsed
  // time is the only client-side signal that separates "kode salah" from "kode kedaluwarsa".
  const sentAtRef = useRef<number>(Date.now());

  // Cooldown ticker — a code was just sent when this page loaded, so start disabled. NOTE: mounting
  // this page NEVER sends a code; the only sender is the "resend" button below (with this cooldown).
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onResend = useCallback(async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await resendRecoveryCode(email);
      setNotice(t.auth.resetNoticeSent);
    } catch {
      setNotice(t.auth.resetNoticeSent);
    } finally {
      setResending(false);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      // A new code was requested → the old verification (if any) no longer applies, and the validity
      // window restarts from now.
      verifiedRef.current = false;
      setCodeAccepted(false);
      sentAtRef.current = Date.now();
    }
  }, [email, cooldown, resending, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email) {
      setError(t.auth.resetErrIncomplete);
      return;
    }
    // Password checks apply to every submit (verify AND the update-only retries).
    if (password.length < MIN_PASSWORD) {
      setError(`${t.auth.resetErrMinCharsA}${MIN_PASSWORD}${t.auth.resetErrMinCharsB}`);
      return;
    }
    if (password !== confirm) {
      setError(t.auth.resetErrMismatch);
      return;
    }

    const supabase = createClient();
    setLoading(true);
    try {
      // ── STEP 1: verify — ONLY if not already verified this session. ──
      if (!verifiedRef.current) {
        const token = code.replace(/\s/g, "");
        if (token.length !== CODE_LENGTH || !/^\d+$/.test(token)) {
          setError(`${t.auth.resetErrCodeDigitsA}${CODE_LENGTH}${t.auth.resetErrCodeDigitsB}`);
          return;
        }
        // verifyOtp ALWAYS uses type 'recovery' — the recovery token is issued by
        // generateLink({type:'recovery'}); any other type would never match it. (Locked by test.)
        const { error: verifyErr } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
        if (verifyErr) {
          // GoTrue merges wrong-code and expired-code into one 403; separate them by elapsed time
          // since the code was sent. "already used" can only arise if state got out of sync (the
          // verify-once guard normally prevents reaching verify after a success).
          const elapsedMin = (Date.now() - sentAtRef.current) / 60_000;
          const state = classifyResetFailure({
            alreadyVerified: verifiedRef.current,
            step: "verify",
            likelyExpired: elapsedMin > validityMinutes,
          });
          void logResetFailure(state);
          setError(
            state === "code_already_used"
              ? t.auth.resetErrUsed
              : state === "code_expired"
                ? t.auth.resetErrExpired
                : t.auth.resetErrWrongCode,
          );
          return;
        }
        // Token consumed, session live. Never verify again.
        verifiedRef.current = true;
        setCodeAccepted(true);
      }

      // ── STEP 2: set the new password on the live session. Retried without re-verifying. ──
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        void logResetFailure(classifyResetFailure({ alreadyVerified: true, step: "update" }));
        const kind = classifyPasswordReject(updateErr);
        setError(
          kind === "same_as_old"
            ? t.auth.resetErrPwSame
            : kind === "too_weak"
              ? t.auth.resetErrPwWeak
              : t.auth.resetErrPwRejected,
        );
        // Stay on the form; the code is accepted, so the next attempt only re-runs updateUser.
        return;
      }

      await supabase.auth.signOut();
      setPhase("done");
    } catch {
      setError(t.auth.resetErrConn);
    } finally {
      setLoading(false);
    }
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p role="status" className="font-body text-[14px] leading-relaxed text-ink">
          {t.auth.resetDone}
        </p>
        <Button size="lg" className="w-full" onClick={() => router.push("/login")}>
          {t.auth.resetToLoginButton}
        </Button>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p role="alert" className="font-body text-[14px] leading-relaxed text-ink">
          {t.auth.resetNeedFlow}
        </p>
        <Button size="lg" className="w-full" onClick={() => router.push("/forgot-password")}>
          {t.auth.resetToForgotButton}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="font-body text-[13px] leading-relaxed text-ink-soft">
        {t.auth.resetSentA}<span className="font-mono text-[12px] text-ink">{email}</span>{t.auth.resetSentB}
        <strong>{validityLabel}</strong>{t.auth.resetSentC}
      </p>

      {codeAccepted && (
        <p role="status" className="font-body text-[13px] leading-relaxed text-green">
          {t.auth.resetCodeAccepted}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{t.auth.codeLabel}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required={!codeAccepted}
          disabled={codeAccepted}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={"".padStart(CODE_LENGTH, "•")}
          maxLength={CODE_LENGTH}
          className="font-mono tracking-[6px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t.auth.newPasswordLabel}</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`${t.auth.minCharsPlaceholderA}${MIN_PASSWORD}${t.auth.minCharsPlaceholderB}`}
          showLabel={t.auth.showPassword}
          hideLabel={t.auth.hidePassword}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">{t.auth.confirmPasswordLabel}</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          showLabel={t.auth.showPassword}
          hideLabel={t.auth.hidePassword}
        />
      </div>

      {error && <p role="alert" className="font-body text-[13px] text-red">{error}</p>}
      {notice && <p role="status" className="font-body text-[13px] text-ink-soft">{notice}</p>}

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
        {loading ? t.auth.saving : t.auth.saveButton}
      </Button>

      <button
        type="button"
        onClick={onResend}
        disabled={cooldown > 0 || resending}
        className="font-body text-[12px] text-ink-soft underline underline-offset-2 hover:text-ink disabled:no-underline disabled:opacity-60"
      >
        {cooldown > 0 ? `${t.auth.resendCooldownA}${cooldown}${t.auth.resendCooldownB}` : resending ? t.auth.resending : t.auth.resendButton}
      </button>
    </form>
  );
}
