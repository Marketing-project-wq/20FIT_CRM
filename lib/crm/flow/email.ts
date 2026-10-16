/**
 * Flow email renderer — turns an email node's fields into a complete, branded email document for the
 * business unit it speaks for (lib/crm/flow/brands.ts). Pure (no I/O): the builder preview and the real
 * send render the same bytes.
 *
 * Layout (600px, table-based, inline styles, light-only — survives Gmail/Outlook/Apple Mail):
 *   preheader · unit header (logo on the unit's band) · optional hero image · kicker · headline · body ·
 *   promo box · bulletproof CTA (VML for Outlook) · unit info strip (lokasi / WhatsApp / Instagram) ·
 *   ekosistem 20FIT row · footer (alasan menerima, berhenti berlangganan, alamat 20FIT Group).
 * Every user-supplied string is HTML-escaped; {{variables}} come from the profile + enrollment context.
 */
import { renderEmailDocument, emailHtmlToText } from "../email-document";
import { BRANDS, ECOSYSTEM, GROUP_ADDRESS, detectBrand, type Brand } from "./brands";

export interface FlowEmailContent {
  subject?: unknown;
  preheader?: unknown;
  headline?: unknown;
  body?: unknown;
  cta_label?: unknown;
  cta_url?: unknown;
  promo_code?: unknown;
  promo_note?: unknown;
  hero_image_url?: unknown;
  brand?: unknown;
}

export interface FlowEmailVars {
  first_name: string;
  full_name: string;
  city: string;
  [key: string]: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** {{key}} → value; unknown keys become empty (never a raw "{{…}}" in a customer's inbox). */
export function fillVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k.toLowerCase()] ?? vars[k] ?? "");
}

/** Context values usable as {{key}} in copy (event, produk, jersey, momen, …). Dates shown in WIB. */
export function ctxVars(ctx: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx ?? {})) {
    if (v == null) continue;
    if (k.endsWith("_mulai") || k === "at" || k.endsWith("_at") || k === "tanggal") {
      const raw = String(v);
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+07:00` : raw);
      if (!Number.isNaN(d.getTime())) {
        out[k] = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
        continue;
      }
    }
    // "Ticket.20fit.id — Nama Produk" → "Nama Produk" for copy.
    out[k] = String(v).replace(/^[^—]+—\s*/, "");
  }
  return out;
}

export function withUtm(url: string, flowId: string, node: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return url;
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "crm");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "email");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", `flow_${flowId.toLowerCase()}`);
    if (!u.searchParams.has("utm_content")) u.searchParams.set("utm_content", node);
    return u.toString();
  } catch {
    return url;
  }
}

const FONT = "Arial,Helvetica,sans-serif";
/** Link/border color readable on white: units whose accent is black use their ink instead. */
const linkColor = (b: Brand) => (b.accent === "#0b0b0b" ? b.ink : b.accent);

function button(label: string, href: string, b: Brand): string {
  const h = esc(href);
  const l = esc(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;"><tr><td>
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="12%" stroke="f" fillcolor="${b.accent}"><w:anchorlock/><center style="color:${b.accentText};font-family:${FONT};font-size:15px;font-weight:bold;">${l}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${h}" style="display:inline-block;background:${b.accent};color:${b.accentText};font-family:${FONT};font-size:15px;font-weight:bold;line-height:48px;padding:0 28px;border-radius:6px;text-decoration:none;">${l}&nbsp;&rarr;</a><!--<![endif]-->
</td></tr></table>`;
}

function infoStrip(b: Brand): string {
  const items: string[] = [];
  const lc = linkColor(b);
  if (b.location) items.push(`<b style="color:${b.ink};">Lokasi</b>&nbsp; ${esc(b.location)}`);
  if (b.whatsapp) items.push(`<b style="color:${b.ink};">WhatsApp</b>&nbsp; <a href="${esc(b.whatsapp.href)}" style="color:${lc};text-decoration:none;">${esc(b.whatsapp.label)}</a>`);
  if (b.instagram) items.push(`<b style="color:${b.ink};">Instagram</b>&nbsp; <a href="${esc(b.instagram.href)}" style="color:${lc};text-decoration:none;">${esc(b.instagram.handle)}</a>`);
  if (!b.whatsapp && b.email) items.push(`<b style="color:${b.ink};">Email</b>&nbsp; ${esc(b.email)}`);
  if (!items.length) return "";
  return `<tr><td style="padding:0 36px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${b.pageBg};border-radius:8px;"><tr><td style="padding:14px 18px;font-family:${FONT};font-size:13px;line-height:1.8;color:${b.muted};">
${items.join("<br>")}
</td></tr></table></td></tr>`;
}

function ecosystem(b: Brand, flowId: string, node: string): string {
  const cells = ECOSYSTEM.map(
    (e) => `<td align="center" valign="top" style="padding:0 4px;width:16%;">
<a href="${esc(withUtm(e.href, flowId, `${node}_eco`))}" style="text-decoration:none;color:${b.muted};font-family:${FONT};font-size:11px;">
<img src="${e.icon}" width="40" height="40" alt="" style="display:block;margin:0 auto 4px;border:0;width:40px;height:40px;">${esc(e.label)}</a></td>`,
  ).join("");
  return `<tr><td style="padding:22px 24px 6px;border-top:1px solid #e5e5e5;">
<div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:2px;color:${b.muted};text-align:center;margin:0 0 12px;">EKOSISTEM 20FIT</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
</td></tr>`;
}

export function renderFlowEmail(
  content: FlowEmailContent,
  vars: FlowEmailVars,
  opts: { flowId: string; node: string; unsubscribeUrl: string },
): { subject: string; html: string; text: string; brand: Brand; senderName: string } {
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const b = detectBrand(content.brand, content.cta_url);
  const promo = str(content.promo_code).trim();
  const all: Record<string, string> = { ...vars, promo_code: promo };
  const subject = fillVars(str(content.subject), all).replace(/\s+/g, " ").trim() || `Kabar dari ${b.senderName}`;
  const preheader = fillVars(str(content.preheader), all).trim();
  const headline = fillVars(str(content.headline), all).trim();
  const paragraphs = fillVars(str(content.body), all).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const ctaLabel = fillVars(str(content.cta_label), all).trim();
  const ctaUrl = str(content.cta_url).trim();
  const hero = str(content.hero_image_url).trim();
  const promoNote = fillVars(str(content.promo_note), all).trim();

  const rows: string[] = [];
  rows.push(`<tr><td style="background:${b.headerBg};padding:22px 36px;border-bottom:3px solid ${b.headerLine};border-radius:10px 10px 0 0;">
<a href="${esc(withUtm(b.web.href, opts.flowId, `${opts.node}_logo`))}" style="text-decoration:none;"><img src="${b.logo.url}" width="${b.logo.width}" height="${b.logo.height}" alt="${esc(b.logo.alt)}" style="display:block;border:0;height:${b.logo.height}px;width:${b.logo.width}px;max-width:100%;"></a>
</td></tr>`);
  if (/^https:\/\//.test(hero)) {
    rows.push(`<tr><td style="padding:0;"><img src="${esc(hero)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`);
  }
  const body: string[] = [];
  body.push(`<div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:2px;color:${b.accent === "#0b0b0b" ? b.muted : b.accent};margin:0 0 10px;">${esc(b.kicker)}</div>`);
  if (headline) body.push(`<h1 style="margin:0 0 18px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:bold;color:${b.ink};">${esc(headline)}</h1>`);
  for (const p of paragraphs) {
    body.push(`<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${b.ink};">${esc(p).replace(/\r?\n/g, "<br>")}</p>`);
  }
  if (promo) {
    body.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;"><tr>
<td style="border:2px dashed ${linkColor(b)};border-radius:8px;padding:12px 20px;">
<div style="font-family:${FONT};font-size:11px;letter-spacing:1.5px;color:${b.muted};margin:0 0 4px;">KODE PROMO</div>
<div style="font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:bold;letter-spacing:3px;color:${b.ink};">${esc(promo)}</div>
${promoNote ? `<div style="font-family:${FONT};font-size:12px;color:${b.muted};margin-top:6px;">${esc(promoNote)}</div>` : ""}
</td></tr></table>`);
  }
  if (ctaLabel && /^https:\/\//.test(ctaUrl)) body.push(button(ctaLabel, withUtm(ctaUrl, opts.flowId, opts.node), b));
  body.push(`<p style="margin:26px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${b.muted};">Salam sehat,<br><b style="color:${b.ink};">Tim ${esc(b.senderName)}</b></p>`);
  rows.push(`<tr><td style="padding:30px 36px 26px;">${body.join("\n")}</td></tr>`);
  rows.push(infoStrip(b));
  rows.push(ecosystem(b, opts.flowId, opts.node));
  rows.push(`<tr><td style="padding:18px 36px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:#8a8a8e;text-align:center;">
Kamu menerima email ini karena ${esc(b.reason)}.<br>
<a href="${esc(opts.unsubscribeUrl)}" style="color:#8a8a8e;text-decoration:underline;">Berhenti berlangganan</a> &nbsp;·&nbsp; <a href="${esc(withUtm(b.web.href, opts.flowId, `${opts.node}_footer`))}" style="color:#8a8a8e;text-decoration:underline;">${esc(b.web.label)}</a><br>
© ${new Date().getFullYear()} ${esc(GROUP_ADDRESS)}
</td></tr>`);

  const html = `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>:root{color-scheme:light only;} @media (max-width:620px){ .wrap{width:100% !important;} }</style>
</head>
<body style="margin:0;padding:0;background:${b.pageBg};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${b.pageBg};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;">
${rows.join("\n")}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;

  // Full document → renderEmailDocument sends it verbatim (adds the dark-mode guard if missing).
  const doc = renderEmailDocument(html, opts.unsubscribeUrl);
  return { subject, html: doc.html, text: emailHtmlToText(doc.html, opts.unsubscribeUrl), brand: b, senderName: b.senderName };
}

export { BRANDS };
