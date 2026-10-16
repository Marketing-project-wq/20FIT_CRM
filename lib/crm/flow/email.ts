/**
 * Flow email renderer — turns an email node's fields (subject, headline, body, CTA, promo) into the
 * 20FIT email body. Pure (no I/O) so the builder preview and the real send render the same bytes.
 * Every user-supplied string is HTML-escaped; {{variables}} are substituted from the recipient's
 * profile + the enrollment context. The skeleton + unsubscribe footer come from renderEmailDocument.
 */
import { renderEmailDocument } from "@/lib/crm/email-document";

export interface FlowEmailContent {
  subject?: unknown;
  preheader?: unknown;
  headline?: unknown;
  body?: unknown;
  cta_label?: unknown;
  cta_url?: unknown;
  promo_code?: unknown;
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

/** Context values usable as {{key}} in copy (event, produk, jersey, …). Dates shown in WIB. */
export function ctxVars(ctx: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx ?? {})) {
    if (v == null) continue;
    if (k.endsWith("_mulai") || k === "at" || k.endsWith("_at")) {
      const d = new Date(String(v));
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

export function renderFlowEmail(
  content: FlowEmailContent,
  vars: FlowEmailVars,
  opts: { flowId: string; node: string; unsubscribeUrl: string },
): { subject: string; html: string; text: string } {
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const promo = str(content.promo_code).trim();
  const all: Record<string, string> = { ...vars, promo_code: promo };
  const subject = fillVars(str(content.subject), all).replace(/\s+/g, " ").trim() || "Kabar dari 20FIT";
  const preheader = fillVars(str(content.preheader), all).trim();
  const headline = fillVars(str(content.headline), all).trim();
  const paragraphs = fillVars(str(content.body), all)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ctaLabel = fillVars(str(content.cta_label), all).trim();
  const ctaUrl = str(content.cta_url).trim();

  const parts: string[] = [];
  if (preheader) {
    parts.push(`<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>`);
  }
  parts.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;color:#e4002b;margin:0 0 16px;">20FIT</div>`);
  if (headline) {
    parts.push(`<h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.25;color:#1d1d1f;">${esc(headline)}</h1>`);
  }
  for (const p of paragraphs) {
    parts.push(`<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1d1d1f;">${esc(p).replace(/\r?\n/g, "<br>")}</p>`);
  }
  if (promo) {
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;"><tr>` +
        `<td style="border:2px dashed #e4002b;border-radius:6px;padding:10px 18px;font-family:'Courier New',monospace;font-size:18px;font-weight:bold;letter-spacing:2px;color:#1d1d1f;">${esc(promo)}</td>` +
        `</tr></table>`,
    );
  }
  if (ctaLabel && /^https:\/\//.test(ctaUrl)) {
    const href = esc(withUtm(ctaUrl, opts.flowId, opts.node));
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;"><tr>` +
        `<td style="background:#e4002b;border-radius:6px;"><a href="${href}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(ctaLabel)}</a></td>` +
        `</tr></table>`,
    );
  }
  parts.push(`<p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#6e6e73;">Salam sehat,<br>Tim 20FIT</p>`);

  const doc = renderEmailDocument(parts.join("\n"), opts.unsubscribeUrl);
  return { subject, html: doc.html, text: doc.text };
}
