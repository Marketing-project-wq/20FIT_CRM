/**
 * Email HTML composition — the "kerangka" that makes a message render the SAME across Gmail, Outlook,
 * and Apple Mail (T-37). PURE (no I/O, no "server-only") on purpose, so the SEND path and the editor
 * PREVIEW call the exact same function and can never disagree about the final email — the "one rule,
 * two implementations" trap this project has paid for repeatedly. The composer preview therefore shows
 * the REAL bytes that go out, frame and all.
 *
 * WHY THIS EXISTS. The send path used to wrap the body as `<div>${body.replace(/\n/g,"<br/>")}</div>`.
 * On a plain-text body that is fine; on an HTML email it is catastrophic — it injects a <br/> at EVERY
 * newline (hundreds of spurious breaks → the giant vertical gaps between cards) and nests a full
 * <html> document inside a <div> (Gmail's sanitiser strips <html>/<head>, dropping the <style>/MSO
 * rules and collapsing the layout). That send-side mangling — not the templates — was the mess on
 * desktop Gmail. This module replaces it: a correct HTML document is sent verbatim; a fragment or a
 * plain-text body is wrapped in a table-based, inline-styled, 600px, LIGHT skeleton the author cannot
 * break; and the unsubscribe link is guaranteed present either way.
 *
 * EMAIL-CLIENT RULES BAKED IN (not aspirations — the layout survives without any of the fragile bits):
 *   - table-based layout (outer 100% background table, inner 600px centred container). No flex/grid/
 *     position/float — none work across clients.
 *   - ALL CSS inline on the element. No reliance on <head><style> (dropped by Gmail/others). A media
 *     query MAY refine mobile, but the single-column 600px table is already correct without it.
 *   - spacing from cell PADDING, never margin (Outlook drops margins, Gmail trims them).
 *   - light background by default (#f4f4f5 / #ffffff): dark-mode inversion across clients is
 *     unpredictable and a dark design can become dark-on-dark. A dark theme is a separate, must-be-
 *     client-tested decision (see docs/CEKLIS-email-lintas-klien.md), never the default.
 *   - MSO ghost table + PixelsPerInch so Outlook honours the 600px width.
 *   - unsubscribe link in the FRAME right after the content (well before Gmail's ~102KB clip point),
 *     so "no unsubscribe → cannot send" holds structurally, not by the author remembering.
 */

export interface EmailParts {
  /** The full HTML document to send / preview. */
  html: string;
  /** A plain-text alternative (keeps link URLs, incl. the unsubscribe URL). */
  text: string;
}

/** A body that is already a complete HTML document (its own <html> shell) — send/preview verbatim. */
export function isFullHtmlDocument(body: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(body);
}

/** Does the string contain any HTML tag at all? (else it is plain text). */
function hasAnyHtmlTag(body: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(body);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The bulletproof skeleton. Wraps `contentHtml` (flow content) in the table-based, inline-styled,
 * 600px LIGHT frame, and appends the unsubscribe footer row unless the content already carries the
 * unsubscribe URL (so a body that already links it is not double-linked). Everything here is inline
 * and table-based — nothing depends on a <style> block surviving.
 */
export function wrapEmailSkeleton(contentHtml: string, unsubscribeUrl: string): string {
  const alreadyHasUnsub = unsubscribeUrl.length > 0 && contentHtml.includes(unsubscribeUrl);
  const footer = alreadyHasUnsub
    ? ""
    : `
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#666666;text-align:center;">
            <a href="${unsubscribeUrl}" style="color:#666666;text-decoration:underline;">Berhenti berlangganan</a>
          </td>
        </tr>`;
  return `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;">
          <tr>
            <td style="padding:24px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1d1d1f;">
${contentHtml}
            </td>
          </tr>${footer}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Compose the final email from a template body that has ALREADY had its {{variables}} substituted.
 * `unsubscribeUrl` is the real signed per-recipient URL (or a sample one for the preview).
 *
 *  - full HTML document → sent VERBATIM (never <br/>-mangled, never <div>-wrapped). Legacy templates
 *    keep their exact bytes (they are versioned; an already-sent version must stay viewable as-is).
 *  - HTML fragment → wrapped in the skeleton.
 *  - plain text → HTML-escaped, newlines → <br>, wrapped in the skeleton.
 */
export function renderEmailDocument(renderedBody: string, unsubscribeUrl: string): EmailParts {
  let html: string;
  if (isFullHtmlDocument(renderedBody)) {
    html = renderedBody;
  } else if (hasAnyHtmlTag(renderedBody)) {
    html = wrapEmailSkeleton(renderedBody, unsubscribeUrl);
  } else {
    const asHtml = `<p style="margin:0;">${escapeHtml(renderedBody).replace(/\r?\n/g, "<br>")}</p>`;
    html = wrapEmailSkeleton(asHtml, unsubscribeUrl);
  }
  return { html, text: emailHtmlToText(html, unsubscribeUrl) };
}

/**
 * Plain-text alternative from the HTML. Keeps link targets — a link becomes "label (url)" — so the
 * unsubscribe URL survives into the text/plain part (the send-time assertHasUnsubscribeLink checks
 * BOTH parts). Not a full HTML renderer; good enough for the alt body.
 */
export function emailHtmlToText(html: string, unsubscribeUrl: string): string {
  let s = html;
  s = s.replace(/<!doctype[\s\S]*?>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // <a href="X">label</a> → "label (X)" (skip when the label already is the URL)
  s = s.replace(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
    const text = label.replace(/<[^>]+>/g, "").trim();
    return text && text !== href ? `${text} (${href})` : href;
  });
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (unsubscribeUrl && !s.includes(unsubscribeUrl)) {
    s += `\n\nBerhenti berlangganan: ${unsubscribeUrl}`;
  }
  return s;
}
