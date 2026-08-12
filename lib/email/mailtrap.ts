import "server-only";

/**
 * Minimal Mailtrap Email Sending API client — the app's OWN outbound mailer, used instead
 * of the shared Supabase Auth mailer (see lib/auth/recovery-email.ts for why). Server-only:
 * MAILTRAP_API_TOKEN is a Sending credential for the 20fit.id domain and must never reach
 * the client. If it leaks, anyone can send mail as 20fit.id — treat rotation as urgent
 * (docs/SETUP-reset-password.md).
 *
 * Errors are surfaced as thrown Error with NO PII (never the recipient, never the body) so
 * callers can log status/code only, matching app/login/actions.ts. The token is never
 * logged.
 */

const SEND_ENDPOINT = "https://send.api.mailtrap.io/api/send";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send one transactional email through Mailtrap Sending. From-identity is fixed to
 * `20FIT CRM <MAILTRAP_FROM>` (MAILTRAP_FROM = crm@20fit.id on Railway) so reset mail no
 * longer arrives under another team's sender name. Throws on missing config or a non-2xx
 * response; the thrown message carries no recipient address or body.
 */
export async function sendTransactionalEmail(mail: OutboundEmail): Promise<void> {
  const token = process.env.MAILTRAP_API_TOKEN;
  const from = process.env.MAILTRAP_FROM;
  if (!token || !from) {
    throw new Error("Mailtrap is not configured (MAILTRAP_API_TOKEN / MAILTRAP_FROM missing).");
  }

  const res = await fetch(SEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: from, name: "20FIT CRM" },
      to: [{ email: mail.to }],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      category: "password-reset",
    }),
    // Never cache an email send.
    cache: "no-store",
  });

  if (!res.ok) {
    // Do NOT include the recipient or the response body verbatim (could echo the address).
    throw new Error(`Mailtrap send failed with HTTP ${res.status}.`);
  }
}
