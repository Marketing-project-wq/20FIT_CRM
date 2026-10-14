import { extractVariables } from "../template";
import { isFullHtmlDocument } from "../email-document";

/** HTML helpers for Agent Mail's create_email — pure, so they are unit-tested directly. */

/**
 * Make sure the body carries {{unsubscribe_url}} — the composer refuses any template without it, and
 * the send engine asserts the rendered link. A full HTML document gets a visible footer before
 * </body>. A fragment is wrapped by the CRM skeleton at send time, which already prints the link, so
 * it only needs the variable present (an HTML comment keeps it from showing twice).
 */
export function ensureUnsubscribe(html: string): { html: string; added: boolean } {
  if (extractVariables(html).includes("unsubscribe_url")) return { html, added: false };
  if (isFullHtmlDocument(html)) {
    const footer =
      '<div style="padding:24px 16px;text-align:center;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#8a8a8a;">' +
      'Tidak ingin menerima email seperti ini lagi? <a href="{{unsubscribe_url}}" style="color:#8a8a8a;text-decoration:underline;">Berhenti berlangganan</a></div>';
    return /<\/body>/i.test(html)
      ? { html: html.replace(/<\/body>/i, `${footer}</body>`), added: true }
      : { html: html + footer, added: true };
  }
  return { html: `${html}\n<!-- {{unsubscribe_url}} -->`, added: true };
}

export function withPreheader(html: string, preheader: string): string {
  if (!preheader) return html;
  const esc = preheader.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const block = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => `${m}${block}`) : block + html;
}

