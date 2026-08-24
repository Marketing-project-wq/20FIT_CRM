"use server";

import { redirect } from "next/navigation";
import { sendRecoveryCode } from "@/lib/auth/recovery";
import { logApiFailure } from "@/lib/crm/failure-log";
import type { ResetFailure } from "@/lib/auth/reset-verify";

/**
 * Record a reset FAILURE state through the Sprint 3K failure path (lib/crm/failure-log) so the
 * NEXT occurrence is visible in the Railway log, not only on the user's screen — the incident of
 * 24 Aug 2026 hid a real updateUser-422 for days behind a generic "wrong code" message.
 *
 * WHY the 3K console path and NOT an audit-table row: (1) it is the durable, greppable, PII-free
 * trace 3K built for exactly this ("a failed operation leaves no trace except a hole in the audit
 * id sequence"); (2) this is a server action reachable from an unauthenticated client, so it must
 * NOT write audit rows — that would be a caller-driven audit-spam path; a console line is harmless
 * under abuse. The coarse `state` is the failure KIND (no email, no code — logApiFailure's signature
 * cannot carry PII by construction).
 */
export async function logResetFailure(state: ResetFailure): Promise<void> {
  const allowed: ResetFailure[] = [
    "verify_failed",
    "code_expired",
    "code_already_used",
    "password_rejected",
  ];
  const safe = allowed.includes(state) ? state : "verify_failed";
  try {
    logApiFailure("reset-password", safe);
  } catch {
    // Logging a failure must never itself break the flow; swallow.
  }
}

/**
 * Request a password-reset CODE. The app generates the code with generateLink (which sends
 * no email) and mails it itself via Mailtrap — the shared Supabase mailer/template is never
 * touched (it belongs to every team on this project). See lib/auth/recovery.ts.
 *
 * ANTI-ENUMERATION: the result is IDENTICAL whether or not the email has an account. On
 * success we hand off to /reset-password (code entry) for EVERY valid-looking address —
 * including ones with no account, which simply never receive a code. The audit row is
 * written the same way regardless and never records the email or the code.
 */
export async function requestPasswordReset(formData: FormData) {
  const raw = String(formData.get("email") ?? "").trim();
  if (!raw || !raw.includes("@")) {
    redirect("/forgot-password?error=invalid");
  }

  const { outcome, email } = await sendRecoveryCode(raw);

  if (outcome === "error" || !email) {
    redirect("/forgot-password?error=unavailable");
  }
  // Uniform: go to code entry for any valid address (existent or not). Carry the normalized
  // email so the verify step and the on-screen "code sent to …" line use the exact form the
  // system searched for (K-06) — not the raw casing the user typed.
  redirect(`/reset-password?email=${encodeURIComponent(email)}`);
}

/**
 * Resend the code from the /reset-password page. Same pipeline; returns a plain result (no
 * redirect) so the client can drive a cooldown and avoid turning the button into a repeat
 * send path. Still uniform + PII-free.
 */
export async function resendRecoveryCode(rawEmail: string): Promise<{ ok: boolean }> {
  const { outcome } = await sendRecoveryCode(rawEmail);
  return { ok: outcome === "sent" };
}
