import "server-only";
import { addMessage, getAgentSettings, getConversation, setConversationExternal, updateMessage, logActivity, ensureConversation, listMessages } from "./repo";
import { q1 } from "./db";
import { chatIdFor, sendText, wahaConfigured } from "./waha";
import { getConnection, googleConfigured, sendGmail } from "./google";
import type { Contact, Conversation, Message } from "./types";

/**
 * Outbound delivery for the partnership inbox. WhatsApp → WAHA. Email → the connected Gmail mailbox
 * (same thread, so the partner sees one conversation), else Resend from the configured sender with
 * Reply-To pointing at a monitored mailbox.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function textToEmailHtml(text: string): string {
  const paras = text.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1d1d1f;">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`);
  return `<div>${paras.join("")}</div>`;
}

export async function sendResend(opts: { to: string[]; subject: string; text: string; html: string; replyTo?: string; from?: string; attachments?: { filename: string; content: string; content_type?: string }[] }): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY belum diset");
  const s = await getAgentSettings();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: opts.from ?? s.email_from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      reply_to: opts.replyTo ?? s.email_reply_to,
      attachments: opts.attachments,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!r.ok) throw new Error(`Resend ${r.status}: ${j.message ?? ""}`);
  return j.id ?? null;
}

/** Internal heads-up to the team (handoff, meeting needs notes, failures). Never fails the caller. */
export async function notifyTeam(subject: string, text: string): Promise<void> {
  try {
    const s = await getAgentSettings();
    if (!s.notify_email) return;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://crm.20fit.id").replace(/\/+$/, "");
    await sendResend({ to: [s.notify_email], subject: `[Partnership] ${subject}`, text: `${text}\n\n${base}/partnership`, html: textToEmailHtml(`${text}\n\n${base}/partnership`), from: s.email_from, replyTo: s.notify_email });
  } catch {
    /* notification is best-effort */
  }
}

async function contactOf(conv: Conversation): Promise<Contact | null> {
  if (!conv.contact_id) return null;
  return q1<Contact>("select * from p_contact where id = $1", [conv.contact_id]);
}

/**
 * Send `text` into a conversation. Records the message first (status 'sending') so the inbox shows it
 * immediately and a WhatsApp echo webhook can be matched to it, then delivers and stamps the result.
 */
export async function sendToConversation(conversationId: number, text: string, author: string, opts: { subject?: string | null; typing?: boolean } = {}): Promise<Message> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("percakapan tidak ada");
  const contact = await contactOf(conv);
  const s = await getAgentSettings();
  const body = text.trim();
  if (!body) throw new Error("pesan kosong");

  const msg = await addMessage({ conversation_id: conv.id, lead_id: conv.lead_id, direction: "out", author, body, status: "sending", meta: opts.subject ? { subject: opts.subject } : {} });
  if (!msg) throw new Error("gagal mencatat pesan");
  try {
    if (conv.channel === "wa") {
      if (!wahaConfigured()) throw new Error("WhatsApp belum disambungkan");
      const chatId = conv.external_id ?? (contact?.phone ? chatIdFor(contact.phone) : null);
      if (!chatId) throw new Error("kontak tidak punya nomor WhatsApp");
      const id = await sendText(chatId, body, { typing: opts.typing });
      if (!conv.external_id) await setConversationExternal(conv.id, chatId);
      await updateMessage(msg.id, { status: "sent", external_id: id });
    } else {
      const to = contact?.email;
      if (!to) throw new Error("kontak tidak punya email");
      const withSig = author === "ai" && !/salam|regards|terima kasih/i.test(body.slice(-80)) ? `${body}\n\n${s.signature}` : body;
      const subject = opts.subject || conv.subject || "Kolaborasi dengan 20FIT";
      const html = textToEmailHtml(withSig);
      const gconn = googleConfigured() ? await getConnection() : null;
      if (gconn) {
        const lastIn = await q1<{ meta: { message_id?: string } }>(
          "select meta from p_message where conversation_id = $1 and direction = 'in' order by created_at desc limit 1", [conv.id]);
        const sent = await sendGmail({
          to, subject: conv.subject ? (/^re:/i.test(conv.subject) ? conv.subject : `Re: ${conv.subject}`) : subject,
          text: withSig, html, threadId: conv.external_id, inReplyTo: lastIn?.meta?.message_id ?? null, fromName: s.persona_name,
        });
        if (!conv.external_id) await setConversationExternal(conv.id, sent.threadId, subject);
        await updateMessage(msg.id, { status: "sent", external_id: sent.id });
      } else {
        const id = await sendResend({ to: [to], subject, text: withSig, html });
        if (!conv.subject) await setConversationExternal(conv.id, `resend:${conv.id}`, subject);
        await updateMessage(msg.id, { status: "sent", external_id: id ? `resend:${id}` : null });
      }
    }
    return { ...msg, status: "sent" };
  } catch (e) {
    const err = (e as Error).message.slice(0, 300);
    await updateMessage(msg.id, { status: "failed", error: err });
    await logActivity(conv.lead_id, "send_failed", `Gagal kirim ${conv.channel === "wa" ? "WhatsApp" : "email"}: ${err}`, { conversation_id: conv.id }, author);
    throw e;
  }
}

/** Pick (or open) the conversation for a contact on a channel. */
export async function conversationFor(leadId: number, contact: Contact, channel: "wa" | "email"): Promise<Conversation> {
  return ensureConversation(leadId, contact.id, channel, channel === "wa" && contact.phone ? chatIdFor(contact.phone) : null);
}

export async function recentHistory(conversationId: number, limit = 30): Promise<Message[]> {
  return (await listMessages(conversationId, limit)).filter((m) => m.status !== "draft");
}
