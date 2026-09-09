import "server-only";
import type { OutboundEmail, SendReceipt } from "./mailtrap";
import { sendTransactionalEmail as sendViaMailtrap } from "./mailtrap";
import { sendTransactionalEmail as sendViaResend } from "./resend";

/**
 * The email provider SWITCH, not a replacement (TUGAS 4). `EMAIL_PROVIDER=mailtrap|resend` picks the
 * adaptor at call time; default `mailtrap`. Both adaptors share one contract (OutboundEmail + category
 * + senderName → SendReceipt, err.status on failure, zero PII), so the send engine (send-run.ts) never
 * learns which provider ran — it is unchanged, driven only through ports.
 *
 * WHY a runtime switch, not a code swap: switching email providers is the change that must NEVER need a
 * code rollback mid-campaign. If the first Resend test send misbehaves, the owner flips EMAIL_PROVIDER
 * back to `mailtrap` and redeploys — seconds, zero diff. See docs/RUNBOOK-pindah-resend.md.
 *
 * Read fresh on every send (no module-level capture) so a Railway env change takes effect on the next
 * send without a process restart being required to re-read it.
 */
export type { OutboundEmail, SendReceipt };

export type EmailProvider = "mailtrap" | "resend";

export function activeEmailProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER === "resend" ? "resend" : "mailtrap"; // default mailtrap
}

/**
 * The from-ADDRESS the active provider sends as — RESEND_FROM under Resend (info@20fit.id), else
 * MAILTRAP_FROM (crm@20fit.id). This is the value the template preview must show (TAMBAHAN A): a
 * hardcoded address in the preview is the T-74 shape in reverse — the screen promises one address while
 * the send uses another. It is configuration, not a secret (the from-address is visible on every sent
 * email), so it is safe to expose to the editor. Empty string only if the env is unset. Read fresh, so
 * an EMAIL_PROVIDER / *_FROM change is reflected without a restart.
 */
export function activeFromAddress(): string {
  return activeEmailProvider() === "resend"
    ? (process.env.RESEND_FROM ?? "")
    : (process.env.MAILTRAP_FROM ?? "");
}

export async function sendTransactionalEmail(
  mail: OutboundEmail,
  category?: string,
  senderName?: string,
): Promise<SendReceipt> {
  const send = activeEmailProvider() === "resend" ? sendViaResend : sendViaMailtrap;
  // Pass category/senderName through as given; each adaptor applies the shared defaults
  // ("password-reset" / "20FIT CRM") when they are undefined, so behavior is identical either way.
  return send(mail, category, senderName);
}
