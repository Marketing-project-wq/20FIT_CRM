import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/crm/normalize";
import { buildRecoveryEmail } from "@/lib/auth/recovery-email";
import { sendTransactionalEmail } from "@/lib/email/mailtrap";
import { getLang } from "@/lib/i18n/server";

/**
 * Recovery-code pipeline: generateLink (generates an OTP, sends NOTHING) → mail the code
 * ourselves via Mailtrap → audit. Server-only: generateLink needs the service role and must
 * never run on the client.
 *
 * The Supabase project is SHARED across many teams, so we do not touch its SMTP or email
 * template (that would rewrite every team's mail). Instead generateLink({ type: 'recovery' })
 * yields `properties.email_otp`, which we place in our own Indonesian email from
 * `20FIT CRM <crm@20fit.id>`. The user then enters the code and we call
 * verifyOtp({ type: 'recovery' }) client-side (app/reset-password) to get a session.
 *
 * ANTI-ENUMERATION. generateLink FAILS for an address with no account. That failure is
 * caught and returns the SAME "sent" outcome as a real send — the caller shows an identical
 * message either way, so this page can never be used to check who has an account (887 users
 * share this auth project). "error" is reserved for genuine infrastructure failure
 * (Mailtrap/Supabase unreachable), which is independent of whether the address exists.
 *
 * PII-free: neither the email nor the OTP is ever logged or written to audit metadata.
 */

/** How long the recovery OTP is valid. Mirrors Supabase's default Email OTP Expiration
 *  (3600s = 1 hour). Shown to the user and documented in docs/SETUP-reset-password.md; if
 *  the project's expiry is changed, change this label to match. */
export const RECOVERY_OTP_VALIDITY_MINUTES = 60;
export const RECOVERY_OTP_VALIDITY_LABEL = "1 jam";
export const RECOVERY_OTP_VALIDITY_LABEL_EN = "1 hour";

export type RecoveryOutcome = "sent" | "error";

/** True when a generateLink error means "no such account" (uniform-success), as opposed to
 *  an infrastructure failure the user should retry. */
function isNoAccountError(status: number | undefined, code: string | undefined): boolean {
  if (status === 404 || status === 422) return true;
  return typeof code === "string" && code.includes("not_found");
}

/**
 * Generate + mail a recovery code for `rawEmail`, then audit. Returns the normalized email
 * (for display / the verify step) and an outcome that NEVER distinguishes "no account" from
 * a real send. Returns `email: null` only when the input is not a syntactically valid email.
 */
export async function sendRecoveryCode(
  rawEmail: string,
): Promise<{ outcome: RecoveryOutcome; email: string | null }> {
  const email = normalizeEmail(rawEmail); // K-06: normalize once, at the boundary.
  if (!email) return { outcome: "error", email: null };

  let outcome: RecoveryOutcome = "sent";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });

    if (error) {
      if (isNoAccountError(error.status, error.code)) {
        // No account → say nothing different. Uniform "sent"; nothing to mail.
        outcome = "sent";
      } else {
        console.error("[recovery] generateLink error (infra)", {
          status: error.status,
          code: error.code,
        });
        outcome = "error";
      }
    } else {
      const code = data?.properties?.email_otp;
      if (!code) {
        // Unexpected shape — treat as infra error, never surface the address.
        console.error("[recovery] generateLink returned no email_otp");
        outcome = "error";
      } else {
        // Email follows the requester's UI language cookie (default Indonesian when unset).
        const lang = getLang();
        const validity = lang === "en" ? RECOVERY_OTP_VALIDITY_LABEL_EN : RECOVERY_OTP_VALIDITY_LABEL;
        const { subject, text, html } = buildRecoveryEmail(code, validity, lang);
        await sendTransactionalEmail({ to: email, subject, text, html });
        outcome = "sent";
      }
    }
  } catch (e) {
    // generateLink threw, or Mailtrap send threw — a connection/config failure. PII-free log.
    console.error("[recovery] send pipeline threw (connection/config)", {
      name: e instanceof Error ? e.name : typeof e,
      code: (e as { code?: string | number })?.code,
    });
    outcome = "error";
  }

  // Audit: a reset was requested + its coarse outcome. login.password_reset_requested is on
  // the login.% operational allowlist (migration 8). NEVER records the email or the OTP.
  try {
    const admin = createAdminClient();
    await admin.from("crm_audit_log").insert({
      actor_email: "system:password-reset",
      action: "login.password_reset_requested",
      target_table: "auth.users",
      summary: "Permintaan reset kata sandi diajukan.",
      metadata: { outcome }, // outcome ∈ {sent,error}; no email, no code (anti-enumeration + PII-free).
    });
  } catch (e) {
    console.error("[recovery] audit write failed", { code: (e as { code?: string })?.code });
  }

  return { outcome, email };
}
