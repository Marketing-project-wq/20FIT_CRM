/**
 * The password-reset email CONTENT — a PURE function, no I/O, so its wording and the
 * six-digit code placement can be unit-tested (Sprint 3E rule: a rule expressible as a
 * pure function has a test). The actual sending lives in lib/email/mailtrap.ts.
 *
 * WHY THIS EXISTS AS OUR OWN EMAIL. The Supabase Auth mailer + template are a SHARED
 * project setting used by many teams (arena, clinic, uob, my20fit, shop, talent). Changing
 * them to say "20FIT CRM" would rewrite every other team's reset email too — the same
 * shared-setting trap as the authenticated_full_access policy (T-17). So the app generates
 * the code with generateLink() (which sends nothing) and mails it ITSELF, with a sender,
 * subject and language it fully controls. Deliverability (SPF/DKIM/DMARC) is documented in
 * docs/SETUP-reset-password.md — content alone cannot keep this out of spam.
 */

export interface RecoveryEmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Build the Indonesian reset email carrying a six-digit `code`. `validityLabel` is the
 * human phrasing of how long the code lasts (e.g. "1 jam") — shown so a recipient does not
 * try an expired code and assume the system is broken. Names 20FIT CRM as an internal tool
 * whose accounts are admin-created, which also gives the message organisational context
 * (one of the three spam signals we can fix from here; the other two are sender identity
 * and domain authentication).
 */
export function buildRecoveryEmail(code: string, validityLabel: string): RecoveryEmailContent {
  const subject = "Kode atur ulang kata sandi 20FIT CRM";

  const text = [
    "Ada permintaan untuk mengatur ulang kata sandi akun 20FIT CRM Anda.",
    "",
    `Kode verifikasi Anda: ${code}`,
    "",
    `Masukkan kode ini di halaman atur ulang kata sandi. Kode berlaku ${validityLabel} dan hanya dapat dipakai sekali.`,
    "",
    "20FIT CRM adalah alat internal 20FIT; akun dibuat oleh admin. Jika Anda tidak meminta ini,",
    "abaikan email ini — kata sandi Anda tidak berubah.",
  ].join("\n");

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6">',
    "<h2 style=\"margin:0 0 12px\">Atur ulang kata sandi 20FIT CRM</h2>",
    "<p>Ada permintaan untuk mengatur ulang kata sandi akun <strong>20FIT CRM</strong> Anda.</p>",
    "<p>Kode verifikasi Anda:</p>",
    `<p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</p>`,
    `<p>Masukkan kode ini di halaman atur ulang kata sandi. Kode berlaku <strong>${validityLabel}</strong> dan hanya dapat dipakai sekali.</p>`,
    '<p style="font-size:13px;color:#666">20FIT CRM adalah alat internal 20FIT; akun dibuat oleh admin. Jika Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.</p>',
    "</div>",
  ].join("");

  return { subject, text, html };
}
