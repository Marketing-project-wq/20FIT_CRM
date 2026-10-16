import "server-only";
import { q, q1 } from "./db";
import {
  addContact, addMessage, addTask, claimDueTasks, createLead, ensureConversation, finishTask, findContactByEmail, findContactByPhone,
  getAgentSettings, getLead, getMeeting, getSetting, logActivity, setSetting, setStage, updateLead, cancelTasks, listContacts,
} from "./repo";
import { inHours, nextWindow, runAgent, type AgentReason } from "./agent";
import { fmtWib } from "./meetings";
import { conversationFor, notifyTeam, sendToConversation } from "./messaging";
import { describeMedia, phoneFromChatId, type WahaMessageEvent } from "./waha";
import { getConnection, getMessage, googleConfigured, header, listRecentMessageIds, messageText } from "./google";
import type { Conversation, Task } from "./types";

/**
 * Partnership automation tick (every minute from run-scheduled PASS 4) + inbound handlers.
 *   inbound WA (webhook) / email (Gmail poll) → message stored → AI reply task (debounced 40 s, so a
 *   partner typing three bubbles gets one answer)
 *   due tasks → intro / follow-up cadence / ghosting / revive / nurture / meeting reminders / meeting check
 */

let ticking = false;

// ── inbound ──────────────────────────────────────────────────────────────────────────────────
async function scheduleReply(leadId: number, conversationId: number) {
  const s = await getAgentSettings();
  const lead = await getLead(leadId);
  if (!lead || !s.enabled || !lead.autopilot) return;
  await cancelTasks(leadId, ["followup", "revive", "nurture"]);
  const pending = await q1<{ id: number }>("select id from p_task where lead_id = $1 and kind = 'agent_reply' and status = 'pending' and conversation_id = $2 limit 1", [leadId, conversationId]);
  let due = new Date(Date.now() + 40_000);
  if (!inHours(s.reply_hours)) due = nextWindow({ ...s, proactive_hours: s.reply_hours, proactive_days: [0, 1, 2, 3, 4, 5, 6] }, due);
  if (pending) await q("update p_task set due_at = $2 where id = $1", [pending.id, due.toISOString()]);
  else await addTask(leadId, "agent_reply", due, { reason: "inbound" }, conversationId);
}

async function afterInbound(leadId: number) {
  const lead = await getLead(leadId);
  if (!lead) return;
  if (lead.stage === "ghosting" || lead.stage === "nurture") {
    const prev = (await q1<{ stage_before_ghost: string | null }>("select stage_before_ghost from p_lead where id = $1", [leadId]))?.stage_before_ghost;
    await setStage(leadId, (prev as never) || "qualified", "system", "partner membalas lagi");
  } else if (lead.stage === "lead" || lead.stage === "contacted") {
    await setStage(leadId, "qualified", "system");
  }
  await q("update p_lead set followup_count = 0 where id = $1", [leadId]);
}

export async function handleWahaEvent(ev: WahaMessageEvent): Promise<string> {
  await q("insert into p_webhook_raw(source, payload) values ('waha', $1)", [JSON.stringify(ev).slice(0, 200_000)]);
  const p = ev.payload;
  if (ev.event === "message.ack") {
    const status = p.ack === 3 || p.ack === 4 ? "read" : p.ack === 2 ? "delivered" : null;
    if (status) await q("update p_message set status = $2 where external_id = $1 and status in ('sent','delivered')", [p.id, status]);
    return "ack";
  }
  if (ev.event !== "message.any" && ev.event !== "message") return "ignored";
  const chatId = p.fromMe ? p.to ?? "" : p.from;
  if (!chatId || chatId.endsWith("@g.us") || chatId.includes("status@broadcast") || chatId.endsWith("@newsletter")) return "skip-group";
  const body = (p.body ?? "").trim();
  const media = describeMedia(p);
  const phone = await phoneFromChatId(chatId);

  // Our own sends echo back as fromMe: match by external id, or by body to a just-sent message.
  if (p.fromMe) {
    const known = await q1("select 1 from p_message where external_id = $1", [p.id]);
    if (known) return "echo";
    const pending = await q1<{ id: number }>(
      `select m.id from p_message m join p_conversation v on v.id = m.conversation_id
       where v.channel = 'wa' and v.external_id = $1 and m.direction = 'out' and m.external_id is null and m.body = $2 and m.created_at > now() - interval '3 minutes' limit 1`,
      [chatId, body],
    );
    if (pending) { await q("update p_message set external_id = $2 where id = $1", [pending.id, p.id]); return "echo-matched"; }
  }

  let conv = await q1<Conversation>("select * from p_conversation where channel = 'wa' and external_id = $1", [chatId]);
  if (!conv) {
    let contact = phone ? await findContactByPhone(phone) : null;
    if (!contact) {
      if (p.fromMe) return "fromMe-unknown"; // staff chatting with someone not in the pipeline
      const name = p._data?.notifyName || p._data?.pushName || null;
      const lead = await createLead({ company: name ? `Lead WhatsApp — ${name}` : `Lead WhatsApp ${phone ?? chatId.split("@")[0]}`, source: "whatsapp", category: "unknown", stage: "lead" }, "system");
      contact = await addContact(lead.id, { name, phone: phone ?? undefined, is_primary: true });
      await notifyTeam(`Lead WhatsApp baru`, `${name ?? phone ?? chatId} menghubungi nomor partnership:\n"${body.slice(0, 300)}"`);
    }
    conv = await ensureConversation(contact.lead_id, contact.id, "wa", chatId);
  }

  const msg = await addMessage({
    conversation_id: conv.id, lead_id: conv.lead_id, direction: p.fromMe ? "out" : "in",
    author: p.fromMe ? "human:hp" : "partner", body: body || media || "", attachments: p.media?.url ? [{ url: p.media.url, mimetype: p.media.mimetype, name: p.media.filename }] : [],
    external_id: p.id, status: p.fromMe ? "sent" : "received", meta: { media },
    created_at: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : null,
  });
  if (!msg) return "duplicate";
  if (p.fromMe) {
    // A human answered from the phone → take over for a while.
    const s = await getAgentSettings();
    await q("update p_conversation set mode = 'manual', manual_until = now() + make_interval(hours => $2::int) where id = $1", [conv.id, s.manual_takeover_hours]);
    await cancelTasks(conv.lead_id, ["agent_reply"]);
    await logActivity(conv.lead_id, "takeover", "Tim membalas dari HP — AI diam sementara", { conversation_id: conv.id }, "human:hp");
    return "human-from-phone";
  }
  await afterInbound(conv.lead_id);
  await scheduleReply(conv.lead_id, conv.id);
  return "stored";
}

const AUTOMATED = /(no-?reply|mailer-daemon|postmaster|notification|notifications|calendar-notification|bounce|newsletter)@/i;

async function pollGmail(): Promise<number> {
  if (!googleConfigured()) return 0;
  const conn = await getConnection();
  if (!conn) return 0;
  const last = await getSetting<number>("gmail_last_poll", 0);
  if (Date.now() - last < 55_000) return 0;
  await setSetting("gmail_last_poll", Date.now());
  const me = conn.email.toLowerCase();
  let n = 0;
  for (const ref of await listRecentMessageIds("newer_than:2d -in:chats -in:spam -in:trash", 40)) {
    if (await q1("select 1 from p_message where external_id = $1", [ref.id])) continue;
    const m = await getMessage(ref.id);
    const fromRaw = header(m, "From");
    const from = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim().toLowerCase();
    const toRaw = header(m, "To");
    const isMine = from === me || (m.labelIds ?? []).includes("SENT");
    const counterpart = isMine ? (toRaw.match(/<([^>]+)>/)?.[1] ?? toRaw.split(",")[0]).trim().toLowerCase() : from;
    if (!counterpart || AUTOMATED.test(counterpart) || header(m, "List-Unsubscribe")) continue;
    if (!isMine && counterpart.endsWith("@20fit.id")) continue; // internal mail is not a partner conversation
    let conv = await q1<Conversation>("select * from p_conversation where channel = 'email' and external_id = $1", [m.threadId]);
    if (!conv) {
      let contact = await findContactByEmail(counterpart);
      if (!contact) {
        if (isMine) continue; // our mail to someone outside the pipeline
        const name = fromRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || null;
        const domain = counterpart.split("@")[1] ?? "";
        const company = /gmail|yahoo|hotmail|outlook|icloud/.test(domain) ? `Lead email — ${name ?? counterpart}` : domain.split(".")[0].toUpperCase();
        const lead = await createLead({ company, source: "email", category: "unknown", website: /gmail|yahoo|hotmail|outlook|icloud/.test(domain) ? null : domain }, "system");
        contact = await addContact(lead.id, { name, email: counterpart, is_primary: true });
        await notifyTeam("Lead email baru", `${name ?? counterpart} mengirim email ke ${me}: "${header(m, "Subject")}"`);
      }
      conv = await ensureConversation(contact.lead_id, contact.id, "email", m.threadId, header(m, "Subject"));
    }
    const { text, attachments } = messageText(m);
    const msg = await addMessage({
      conversation_id: conv.id, lead_id: conv.lead_id, direction: isMine ? "out" : "in", author: isMine ? "human:gmail" : "partner",
      body: text, attachments, external_id: m.id, status: isMine ? "sent" : "received",
      meta: { message_id: header(m, "Message-ID"), subject: header(m, "Subject") }, created_at: new Date(Number(m.internalDate)).toISOString(),
    });
    if (!msg) continue;
    n++;
    if (isMine) {
      // sent by a person from Gmail (not by us through the API — those ids are already stored)
      const s = await getAgentSettings();
      await q("update p_conversation set mode = 'manual', manual_until = now() + make_interval(hours => $2::int) where id = $1", [conv.id, s.manual_takeover_hours]);
      await cancelTasks(conv.lead_id, ["agent_reply"]);
      continue;
    }
    if (/out of office|automatic reply|balasan otomatis|auto-?reply|cuti/i.test(`${header(m, "Subject")} ${text.slice(0, 200)}`)) {
      await logActivity(conv.lead_id, "auto_reply", "Balasan otomatis (out of office) — tidak dibalas", {}, "system");
      continue;
    }
    await afterInbound(conv.lead_id);
    await scheduleReply(conv.lead_id, conv.id);
  }
  return n;
}

// ── tasks ────────────────────────────────────────────────────────────────────────────────────
async function runTask(t: Task): Promise<string> {
  const s = await getAgentSettings();
  const lead = await getLead(t.lead_id);
  if (!lead) return "lead hilang";
  const proactive = ["intro", "followup", "revive", "nurture"].includes(t.kind);
  if (proactive && !inHours(s.proactive_hours, s.proactive_days)) {
    await finishTask(t.id, "pending", "di luar jam kirim", nextWindow(s));
    return "ditunda";
  }
  if (["intro", "followup", "revive", "nurture", "agent_reply"].includes(t.kind) && (!s.enabled || !lead.autopilot || lead.needs_human)) {
    if (t.kind === "agent_reply") {
      // still prepare a draft so the human has a starting point
      await runAgentDraftInto(t);
      return "draft (autopilot mati / butuh manusia)";
    }
    return "dilewati (autopilot mati / butuh manusia)";
  }
  switch (t.kind) {
    case "agent_reply": {
      const r = await runAgent(t.lead_id, ((t.payload.reason as AgentReason) ?? "inbound"), {
        conversationId: t.conversation_id,
        extra: t.payload.meeting_id ? { notes: (await getMeeting(Number(t.payload.meeting_id)))?.outcome ?? null } : {},
      });
      return r.ok ? (r.sent ? "terkirim" : "tanpa kirim") : `gagal: ${r.error}`;
    }
    case "intro": {
      if (lead.last_outbound_at && !t.payload.contact_id) return "sudah pernah dihubungi";
      let conversationId: number | null = null;
      if (t.payload.contact_id) {
        const c = (await listContacts(lead.id)).find((x) => x.id === Number(t.payload.contact_id));
        if (c) conversationId = (await conversationFor(lead.id, c, c.email ? "email" : "wa")).id;
      }
      const r = await runAgent(lead.id, "intro", { conversationId });
      return r.ok ? (r.sent ? "intro terkirim" : "intro tanpa kirim") : `gagal: ${r.error}`;
    }
    case "followup": {
      if (lead.last_inbound_at && lead.last_outbound_at && +new Date(lead.last_inbound_at) > +new Date(lead.last_outbound_at)) return "partner sudah membalas";
      if (!["contacted", "qualified", "met", "proposal", "negotiation", "lead"].includes(lead.stage)) return `tahap ${lead.stage}, follow-up dibatalkan`;
      if (lead.followup_count >= s.followup_days.length) {
        await setStage(lead.id, "ghosting", "system", "tidak membalas setelah semua follow-up");
        await addTask(lead.id, "revive", nextWindow(s, new Date(Date.now() + s.revive_after_days * 86400_000)), {}, t.conversation_id);
        return "ghosting";
      }
      const r = await runAgent(lead.id, "followup", { conversationId: t.conversation_id });
      await q("update p_lead set followup_count = followup_count + 1 where id = $1", [lead.id]);
      return r.ok ? `follow-up ${lead.followup_count + 1}` : `gagal: ${r.error}`;
    }
    case "revive": {
      if (lead.stage !== "ghosting") return "bukan ghosting lagi";
      const r = await runAgent(lead.id, "revive", { conversationId: t.conversation_id });
      await setStage(lead.id, "nurture", "system", "revive terkirim");
      return r.ok ? "revive terkirim" : `gagal: ${r.error}`;
    }
    case "nurture": {
      if (lead.stage !== "nurture") return "bukan nurture lagi";
      const r = await runAgent(lead.id, "nurture", { conversationId: t.conversation_id });
      return r.ok ? "nurture terkirim" : `gagal: ${r.error}`;
    }
    case "meeting_reminder": {
      const m = await getMeeting(Number(t.payload.meeting_id));
      if (!m || m.status !== "scheduled") return "meeting tidak aktif";
      const contacts = await listContacts(lead.id);
      const c = contacts.find((x) => x.phone) ?? contacts.find((x) => x.email);
      if (!c) return "tanpa kontak";
      const conv = await conversationFor(lead.id, c, c.phone ? "wa" : "email");
      const where = m.kind === "online" ? (m.meet_url ? `Link Google Meet: ${m.meet_url}` : "Online (link di undangan kalender)") : `Lokasi: ${m.location}`;
      const first = c.name ? `Kak ${c.name.split(" ")[0]}` : "Kak";
      const text = t.payload.when === "1h"
        ? `Halo ${first}, sekadar mengingatkan meeting kita 1 jam lagi (${fmtWib(m.start_at)}). ${where}`
        : `Halo ${first}, pengingat meeting ${m.title} besok, ${fmtWib(m.start_at)}. ${where}. Kalau perlu ganti jadwal, kabari saja ya.`;
      await sendToConversation(conv.id, text, "ai", { subject: `Pengingat: ${m.title}`, typing: false });
      return "pengingat terkirim";
    }
    case "meeting_check": {
      const m = await getMeeting(Number(t.payload.meeting_id));
      if (!m || m.status !== "scheduled") return "sudah diupdate";
      await updateLead(lead.id, { needs_human: true, handoff_reason: `Isi hasil meeting ${fmtWib(m.start_at)} (selesai / tidak hadir + catatan)` }, "system");
      await notifyTeam(`Isi hasil meeting: ${lead.company}`, `Meeting ${m.title} (${fmtWib(m.start_at)}) sudah lewat. Tandai Selesai atau Tidak hadir dan tulis catatannya supaya AI bisa mengirim follow-up.`);
      return "minta update manusia";
    }
    default:
      return "jenis tugas tidak dikenal";
  }
}

async function runAgentDraftInto(t: Task) {
  const r = await runAgent(t.lead_id, "draft", { conversationId: t.conversation_id });
  if (r.ok && r.draft && t.conversation_id) {
    await addMessage({ conversation_id: t.conversation_id, lead_id: t.lead_id, direction: "out", author: "ai", body: r.draft, status: "draft", meta: { subject: r.subject ?? null, why: "draft untuk manusia" } });
  }
}

export interface PartnerTickResult { gmail: number; tasks: number; results: string[]; skipped?: string }

export async function partnershipTick(): Promise<PartnerTickResult> {
  if (ticking) return { gmail: 0, tasks: 0, results: [], skipped: "already_running" };
  ticking = true;
  try {
    await q("update p_conversation set mode = 'auto', manual_until = null where mode = 'manual' and manual_until is not null and manual_until < now()");
    let gmail = 0;
    try { gmail = await pollGmail(); } catch (e) { await logActivity(null, "gmail_error", `Gmail: ${(e as Error).message}`.slice(0, 280)); }
    const tasks = await claimDueTasks(20);
    const results: string[] = [];
    const t0 = Date.now();
    for (const t of tasks) {
      if (Date.now() - t0 > 110_000) { await finishTask(t.id, "pending", "ditunda (tick penuh)"); continue; }
      try {
        const r = await runTask(t);
        if (r !== "ditunda") await finishTask(t.id, r.startsWith("gagal") && t.attempts < 3 ? "pending" : r.startsWith("gagal") ? "failed" : "done", r, r.startsWith("gagal") ? new Date(Date.now() + 5 * 60_000) : undefined);
        results.push(`${t.kind}#${t.id}: ${r}`);
      } catch (e) {
        const err = (e as Error).message;
        await finishTask(t.id, t.attempts < 3 ? "pending" : "failed", err, new Date(Date.now() + 5 * 60_000));
        results.push(`${t.kind}#${t.id}: error ${err}`);
      }
    }
    return { gmail, tasks: tasks.length, results };
  } finally {
    ticking = false;
  }
}
