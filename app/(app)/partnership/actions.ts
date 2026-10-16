"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { q, q1 } from "@/lib/partnership/db";
import * as R from "@/lib/partnership/repo";
import { sendToConversation, conversationFor } from "@/lib/partnership/messaging";
import { availableSlots, bookMeeting, fromWib, rescheduleMeeting, setMeetingStatus, type Slot } from "@/lib/partnership/meetings";
import { runAgent, simulateAgent, nextWindow } from "@/lib/partnership/agent";
import { partnershipTick, type PartnerTickResult } from "@/lib/partnership/engine";
import { ensureSession, getSession, logoutSession, wahaConfigured, type WahaSession } from "@/lib/partnership/waha";
import { disconnect as googleDisconnect, getConnection, googleConfigured, redirectUri } from "@/lib/partnership/google";
import {
  DEFAULT_SETTINGS, type Activity, type AgentSettings, type Contact, type Conversation, type KbEntry, type Lead, type Meeting, type Message, type Stage, type Task,
} from "@/lib/partnership/types";

/**
 * Partnership server actions. Gates (lib/auth/roles): use the pipeline & inbox → workflow.create ≠ deny;
 * agent settings, knowledge base, integrations, deleting → workflow.activate.
 */

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function actor() {
  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    email = null;
  }
  const role = email ? await getCurrentUserRole() : null;
  return { email: email ?? "?", canView: !!email && grantFor(role, "workflow.create") !== "deny", canAdmin: !!email && isPermitted(role, "workflow.activate") };
}
async function guard(admin = false) {
  const a = await actor();
  if (!a.canView || (admin && !a.canAdmin)) throw new Error(admin ? "Hanya Super Admin / CRM Manager" : "Akses ditolak");
  return a;
}

// ── board ────────────────────────────────────────────────────────────────────────────────────
export async function boardAction(): Promise<Res<{ leads: Lead[]; stats: Record<string, number> | null }>> {
  try {
    await guard();
    const [leads, stats] = await Promise.all([R.listLeads(), R.agentStats()]);
    return { ok: true, leads, stats };
  } catch (e) { return fail(e); }
}

export async function createLeadAction(input: {
  company: string; category: string; products: string[]; value_estimate?: string | null; city?: string | null; website?: string | null; notes?: string | null;
  priority?: string; owner_email?: string | null; autopilot: boolean; contact: { name?: string; title?: string; phone?: string; email?: string }; contactNow: boolean;
}): Promise<Res<{ id: number }>> {
  try {
    const a = await guard();
    if (!input.company.trim()) return { ok: false, error: "Nama perusahaan wajib diisi" };
    const lead = await R.createLead({
      company: input.company, category: input.category, products: input.products, value_estimate: input.value_estimate || null, city: input.city || null,
      website: input.website || null, notes: input.notes || null, priority: (input.priority as Lead["priority"]) ?? "normal", owner_email: input.owner_email || a.email,
      autopilot: input.autopilot, source: "manual",
    }, a.email);
    if (input.contact.phone || input.contact.email || input.contact.name) await R.addContact(lead.id, { ...input.contact, is_primary: true });
    if (input.autopilot && input.contactNow && (input.contact.phone || input.contact.email)) {
      const s = await R.getAgentSettings();
      await R.addTask(lead.id, "intro", nextWindow(s, new Date(Date.now() + 60_000)));
    }
    return { ok: true, id: lead.id };
  } catch (e) { return fail(e); }
}

export async function importLeadsAction(rows: Record<string, string>[], contactNow: boolean): Promise<Res<{ created: number; skipped: number }>> {
  try {
    const a = await guard();
    const s = await R.getAgentSettings();
    let created = 0, skipped = 0;
    for (const r of rows.slice(0, 2000)) {
      const company = (r.company || r.perusahaan || r.nama_perusahaan || "").trim();
      const phone = r.phone || r.hp || r.whatsapp || r.wa || "";
      const email = (r.email || "").trim();
      if (!company || (!phone && !email)) { skipped++; continue; }
      if ((email && (await R.findContactByEmail(email))) || (phone && (await R.findContactByPhone(phone)))) { skipped++; continue; }
      const lead = await R.createLead({
        company, category: r.category || r.kategori || "unknown", products: (r.products || r.produk || "").split(/[,;|]/).map((x) => x.trim().toLowerCase()).filter(Boolean),
        city: r.city || r.kota || null, notes: r.notes || r.catatan || null, value_estimate: r.value || r.nilai || null, source: "import", owner_email: a.email,
      }, a.email);
      await R.addContact(lead.id, { name: r.name || r.nama || r.contact || undefined, title: r.title || r.jabatan || undefined, phone, email, is_primary: true });
      if (contactNow) await R.addTask(lead.id, "intro", nextWindow(s, new Date(Date.now() + (created % 30) * 4 * 60_000 + 60_000)));
      created++;
    }
    return { ok: true, created, skipped };
  } catch (e) { return fail(e); }
}

export async function updateLeadAction(id: number, patch: Partial<Lead>): Promise<Res> {
  try { const a = await guard(); await R.updateLead(id, patch, a.email); return { ok: true }; } catch (e) { return fail(e); }
}
export async function setStageAction(id: number, stage: Stage, reason?: string): Promise<Res> {
  try { const a = await guard(); await R.setStage(id, stage, a.email, reason); return { ok: true }; } catch (e) { return fail(e); }
}
export async function deleteLeadAction(id: number): Promise<Res> {
  try { await guard(true); await R.deleteLead(id); return { ok: true }; } catch (e) { return fail(e); }
}
export async function contactNowAction(leadId: number): Promise<Res<{ result: string }>> {
  try {
    await guard();
    await R.updateLead(leadId, { needs_human: false, handoff_reason: null }, "system");
    const r = await runAgent(leadId, "intro");
    return r.ok ? { ok: true, result: r.sent ? "Pesan pertama terkirim" : "Draft dibuat (cek inbox)" } : { ok: false, error: r.error ?? "gagal" };
  } catch (e) { return fail(e); }
}

export async function leadDetailAction(id: number): Promise<Res<{ lead: Lead; contacts: Contact[]; conversations: Conversation[]; meetings: Meeting[]; activity: Activity[]; tasks: Task[] }>> {
  try {
    await guard();
    const lead = await R.getLead(id);
    if (!lead) return { ok: false, error: "Lead tidak ada" };
    const [contacts, conversations, meetings, activity, tasks] = await Promise.all([
      R.listContacts(id), R.listConversations({ leadId: id }), R.leadMeetings(id), R.listActivity({ leadId: id, limit: 80 }), R.listTasks({ leadId: id }),
    ]);
    return { ok: true, lead, contacts, conversations, meetings, activity, tasks };
  } catch (e) { return fail(e); }
}
export async function addContactAction(leadId: number, c: Partial<Contact>): Promise<Res> {
  try { await guard(); if (!c.phone && !c.email) return { ok: false, error: "Isi nomor WA atau email" }; await R.addContact(leadId, c); return { ok: true }; } catch (e) { return fail(e); }
}
export async function cancelTaskAction(taskId: number): Promise<Res> {
  try { await guard(); await R.finishTask(taskId, "cancelled", "dibatalkan manual"); return { ok: true }; } catch (e) { return fail(e); }
}

// ── inbox ────────────────────────────────────────────────────────────────────────────────────
export async function conversationsAction(channel?: "wa" | "email"): Promise<Res<{ rows: Conversation[] }>> {
  try { await guard(); return { ok: true, rows: await R.listConversations({ channel }) }; } catch (e) { return fail(e); }
}
export async function threadAction(conversationId: number): Promise<Res<{ conversation: Conversation; messages: Message[]; activity: Activity[] }>> {
  try {
    await guard();
    const conversation = await R.getConversation(conversationId);
    if (!conversation) return { ok: false, error: "Percakapan tidak ada" };
    await R.markRead(conversationId);
    const [messages, activity] = await Promise.all([R.listMessages(conversationId), R.listActivity({ leadId: conversation.lead_id, limit: 40 })]);
    return { ok: true, conversation, messages, activity };
  } catch (e) { return fail(e); }
}
export async function sendManualAction(conversationId: number, text: string, subject?: string | null): Promise<Res> {
  try {
    const a = await guard();
    const s = await R.getAgentSettings();
    await sendToConversation(conversationId, text, `human:${a.email}`, { subject: subject ?? null, typing: false });
    await R.setConversationMode(conversationId, "manual", s.manual_takeover_hours);
    const conv = await R.getConversation(conversationId);
    if (conv) {
      await R.cancelTasks(conv.lead_id, ["agent_reply"]);
      await q("delete from p_message where conversation_id = $1 and status = 'draft'", [conversationId]);
      await R.logActivity(conv.lead_id, "takeover", `${a.email} membalas manual — AI diam ${s.manual_takeover_hours} jam`, { conversation_id: conversationId }, a.email);
    }
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function startConversationAction(leadId: number, contactId: number, channel: "wa" | "email", text: string, subject?: string | null): Promise<Res<{ conversationId: number }>> {
  try {
    const a = await guard();
    const c = (await R.listContacts(leadId)).find((x) => x.id === contactId);
    if (!c) return { ok: false, error: "Kontak tidak ada" };
    const conv = await conversationFor(leadId, c, channel);
    await sendToConversation(conv.id, text, `human:${a.email}`, { subject: subject ?? null, typing: false });
    const lead = await R.getLead(leadId);
    if (lead?.stage === "lead") await R.setStage(leadId, "contacted", a.email);
    return { ok: true, conversationId: conv.id };
  } catch (e) { return fail(e); }
}
export async function sendDraftAction(messageId: number, editedText?: string): Promise<Res> {
  try {
    const a = await guard();
    const d = await q1<Message>("select * from p_message where id = $1 and status = 'draft'", [messageId]);
    if (!d) return { ok: false, error: "Draft tidak ada" };
    await q("delete from p_message where id = $1", [messageId]);
    const edited = editedText && editedText.trim() !== (d.body ?? "").trim();
    await sendToConversation(d.conversation_id, editedText?.trim() || d.body || "", edited ? `human:${a.email}` : "ai", { subject: (d.meta?.subject as string) ?? null, typing: false });
    await R.logActivity(d.lead_id, "draft_sent", `${a.email} mengirim draft AI${edited ? " (diedit)" : ""}`, {}, a.email);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function deleteDraftAction(messageId: number): Promise<Res> {
  try { await guard(); await q("delete from p_message where id = $1 and status = 'draft'", [messageId]); return { ok: true }; } catch (e) { return fail(e); }
}
export async function draftReplyAction(conversationId: number): Promise<Res<{ text: string; subject?: string; reasoning?: string | null }>> {
  try {
    await guard();
    const conv = await R.getConversation(conversationId);
    if (!conv) return { ok: false, error: "Percakapan tidak ada" };
    const r = await runAgent(conv.lead_id, "draft", { conversationId });
    return r.ok ? { ok: true, text: r.draft ?? "", subject: r.subject, reasoning: r.decision?.reasoning ?? null } : { ok: false, error: r.error ?? "gagal" };
  } catch (e) { return fail(e); }
}
export async function setModeAction(conversationId: number, mode: "auto" | "manual"): Promise<Res> {
  try {
    const a = await guard();
    const s = await R.getAgentSettings();
    await R.setConversationMode(conversationId, mode, mode === "manual" ? s.manual_takeover_hours : undefined);
    const conv = await R.getConversation(conversationId);
    if (conv) {
      await R.logActivity(conv.lead_id, "mode", mode === "auto" ? "Percakapan dikembalikan ke AI" : "Percakapan diambil alih manusia", { conversation_id: conversationId }, a.email);
      if (mode === "auto") {
        await R.updateLead(conv.lead_id, { needs_human: false, handoff_reason: null }, a.email);
        const last = await q1<{ direction: string }>("select direction from p_message where conversation_id = $1 and status <> 'draft' order by created_at desc limit 1", [conversationId]);
        if (last?.direction === "in") await R.addTask(conv.lead_id, "agent_reply", new Date(Date.now() + 20_000), { reason: "inbound" }, conversationId);
      }
    }
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ── calendar ─────────────────────────────────────────────────────────────────────────────────
export async function calendarAction(fromIso: string, toIso: string): Promise<Res<{ meetings: Meeting[]; tasks: Task[] }>> {
  try {
    await guard();
    const [meetings, tasks] = await Promise.all([R.listMeetings(fromIso, toIso), R.listTasks({ from: fromIso, to: toIso })]);
    return { ok: true, meetings, tasks };
  } catch (e) { return fail(e); }
}
export async function slotsAction(): Promise<Res<{ slots: Slot[] }>> {
  try { await guard(); return { ok: true, slots: await availableSlots(12, 14) }; } catch (e) { return fail(e); }
}
export async function createMeetingAction(input: { leadId: number; date: string; time: string; minutes: number; kind: "online" | "offline"; location?: string | null; meetUrl?: string | null; notes?: string | null; attendees?: string }): Promise<Res<{ id: number; meetUrl: string | null }>> {
  try {
    const a = await guard();
    const [y, m, d] = input.date.split("-").map(Number);
    const [h, mi] = input.time.split(":").map(Number);
    const start = fromWib(y, m - 1, d, h, mi);
    if (Number.isNaN(start.getTime())) return { ok: false, error: "Tanggal/jam tidak valid" };
    const meeting = await bookMeeting({
      leadId: input.leadId, start, minutes: input.minutes, kind: input.kind, location: input.location, meetUrl: input.meetUrl || null, notes: input.notes,
      extraAttendees: (input.attendees ?? "").split(/[,\s]+/).filter((x) => x.includes("@")), createdBy: a.email,
    });
    return { ok: true, id: meeting.id, meetUrl: meeting.meet_url };
  } catch (e) { return fail(e); }
}
export async function meetingStatusAction(id: number, status: "done" | "no_show" | "cancelled", notes?: string): Promise<Res> {
  try { const a = await guard(); await setMeetingStatus(id, status, a.email, notes || null); return { ok: true }; } catch (e) { return fail(e); }
}
export async function rescheduleAction(id: number, date: string, time: string): Promise<Res> {
  try {
    const a = await guard();
    const [y, m, d] = date.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    await rescheduleMeeting(id, fromWib(y, m - 1, d, h, mi), a.email);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ── agent ────────────────────────────────────────────────────────────────────────────────────
export async function agentOverviewAction(): Promise<Res<{ stats: Record<string, number> | null; activity: Activity[]; settings: AgentSettings; kb: KbEntry[] }>> {
  try {
    await guard();
    const [stats, activity, settings, kb] = await Promise.all([R.agentStats(), R.listActivity({ limit: 150 }), R.getAgentSettings(), R.listKb()]);
    return { ok: true, stats, activity, settings, kb };
  } catch (e) { return fail(e); }
}
export async function saveSettingsAction(s: AgentSettings): Promise<Res> {
  try {
    const a = await guard(true);
    const clean: AgentSettings = { ...DEFAULT_SETTINGS, ...s, followup_days: (s.followup_days ?? []).map(Number).filter((n) => n > 0 && n <= 60).slice(0, 6) };
    if (!clean.followup_days.length) clean.followup_days = DEFAULT_SETTINGS.followup_days;
    await R.setSetting("agent", clean);
    await R.logActivity(null, "settings", `Pengaturan agent diubah oleh ${a.email}`, {}, a.email);
    return { ok: true };
  } catch (e) { return fail(e); }
}
export async function saveKbAction(e: { id?: number; title: string; product: string; content: string; active: boolean }): Promise<Res> {
  try { const a = await guard(true); await R.saveKb(e, a.email); return { ok: true }; } catch (err) { return fail(err); }
}
export async function deleteKbAction(id: number): Promise<Res> {
  try { await guard(true); await R.deleteKb(id); return { ok: true }; } catch (e) { return fail(e); }
}
export async function simulateAction(input: { text: string; channel: "wa" | "email"; category: string; company: string }): Promise<Res<{ decision: Record<string, unknown> }>> {
  try { await guard(); return { ok: true, decision: (await simulateAgent(input)) as unknown as Record<string, unknown> }; } catch (e) { return fail(e); }
}
export async function tickNowAction(): Promise<Res<{ tick: PartnerTickResult }>> {
  try { await guard(true); return { ok: true, tick: await partnershipTick() }; } catch (e) { return fail(e); }
}

// ── connections ──────────────────────────────────────────────────────────────────────────────
export async function connectionsAction(): Promise<Res<{ wa: { configured: boolean; session: WahaSession | null; error?: string }; google: { configured: boolean; connection: { email: string; connected_at: string } | null; redirectUri: string } }>> {
  try {
    await guard();
    let session: WahaSession | null = null;
    let error: string | undefined;
    if (wahaConfigured()) { try { session = await getSession(); } catch (e) { error = (e as Error).message; } }
    const conn = googleConfigured() ? await getConnection() : null;
    return { ok: true, wa: { configured: wahaConfigured(), session, error }, google: { configured: googleConfigured(), connection: conn ? { email: conn.email, connected_at: conn.connected_at } : null, redirectUri: redirectUri() } };
  } catch (e) { return fail(e); }
}
export async function waConnectAction(): Promise<Res<{ status: string }>> {
  try { await guard(true); const s = await ensureSession(); return { ok: true, status: s.status }; } catch (e) { return fail(e); }
}
export async function waLogoutAction(): Promise<Res> {
  try { await guard(true); await logoutSession(); return { ok: true }; } catch (e) { return fail(e); }
}
export async function googleDisconnectAction(): Promise<Res> {
  try { await guard(true); await googleDisconnect(); return { ok: true }; } catch (e) { return fail(e); }
}
