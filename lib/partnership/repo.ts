import "server-only";
import { q, q1 } from "./db";
import {
  DEFAULT_SETTINGS, normPhone,
  type Activity, type AgentSettings, type Contact, type Conversation, type KbEntry, type Lead, type Meeting, type Message, type Stage, type Task,
} from "./types";
import { KB_SEED } from "./kb-seed";

// ── settings ─────────────────────────────────────────────────────────────────────────────────
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await q1<{ value: T }>("select value from p_setting where key = $1", [key]);
  return r ? r.value : fallback;
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  await q("insert into p_setting(key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()", [key, JSON.stringify(value)]);
}
export async function getAgentSettings(): Promise<AgentSettings> {
  return { ...DEFAULT_SETTINGS, ...(await getSetting<Partial<AgentSettings>>("agent", {})) };
}

// ── activity ─────────────────────────────────────────────────────────────────────────────────
export async function logActivity(leadId: number | null, kind: string, title: string, detail: Record<string, unknown> = {}, actor = "system") {
  await q("insert into p_activity(lead_id, kind, title, detail, actor) values ($1,$2,$3,$4,$5)", [leadId, kind, title.slice(0, 300), JSON.stringify(detail), actor]);
}
export async function listActivity(opts: { leadId?: number; limit?: number; kinds?: string[] } = {}): Promise<Activity[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.leadId) { params.push(opts.leadId); where.push(`a.lead_id = $${params.length}`); }
  if (opts.kinds?.length) { params.push(opts.kinds); where.push(`a.kind = any($${params.length})`); }
  params.push(opts.limit ?? 100);
  return q<Activity>(
    `select a.*, l.company from p_activity a left join p_lead l on l.id = a.lead_id
     ${where.length ? `where ${where.join(" and ")}` : ""} order by a.at desc limit $${params.length}`,
    params,
  );
}

// ── leads ────────────────────────────────────────────────────────────────────────────────────
const LEAD_SELECT = `
  select l.*,
    c.name contact_name, c.phone contact_phone, c.email contact_email,
    (select min(m.start_at) from p_meeting m where m.lead_id = l.id and m.status = 'scheduled' and m.end_at > now()) next_meeting_at,
    (select coalesce(sum(v.unread), 0)::int from p_conversation v where v.lead_id = l.id) unread
  from p_lead l
  left join lateral (select * from p_contact x where x.lead_id = l.id order by x.is_primary desc, x.id limit 1) c on true`;

export async function listLeads(): Promise<Lead[]> {
  return q<Lead>(`${LEAD_SELECT} order by l.updated_at desc limit 2000`);
}
export async function getLead(id: number): Promise<Lead | null> {
  return q1<Lead>(`${LEAD_SELECT} where l.id = $1`, [id]);
}
export async function createLead(input: Partial<Lead> & { company: string }, actor: string): Promise<Lead> {
  const r = await q1<Lead>(
    `insert into p_lead(company, category, products, stage, value_estimate, owner_email, source, priority, city, website, notes, tags, autopilot, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
    [
      input.company.trim().slice(0, 200), input.category ?? "unknown", input.products ?? [], input.stage ?? "lead",
      input.value_estimate ?? null, input.owner_email ?? null, input.source ?? "manual", input.priority ?? "normal",
      input.city ?? null, input.website ?? null, input.notes ?? null, input.tags ?? [], input.autopilot ?? true, actor,
    ],
  );
  await logActivity(r!.id, "created", `Lead dibuat (${input.source ?? "manual"})`, {}, actor);
  return r!;
}
const LEAD_FIELDS = ["company", "category", "products", "value_estimate", "owner_email", "priority", "city", "website", "notes", "tags", "autopilot", "needs_human", "handoff_reason", "summary", "lost_reason", "next_action", "next_action_at"] as const;
export async function updateLead(id: number, patch: Partial<Lead>, actor: string): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const k of LEAD_FIELDS) {
    if (k in patch) {
      params.push((patch as Record<string, unknown>)[k] ?? null);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (!sets.length) return;
  params.push(id);
  await q(`update p_lead set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`, params);
  if ("autopilot" in patch) await logActivity(id, "autopilot", patch.autopilot ? "Autopilot AI dinyalakan" : "Autopilot AI dimatikan", {}, actor);
  if ("needs_human" in patch && patch.needs_human === false) await logActivity(id, "handoff_resolved", "Tanda 'butuh manusia' diselesaikan", {}, actor);
}
export async function setStage(id: number, stage: Stage, actor: string, reason?: string): Promise<void> {
  const cur = await q1<{ stage: string }>("select stage from p_lead where id = $1", [id]);
  if (!cur || cur.stage === stage) return;
  await q(
    `update p_lead set stage = $2, updated_at = now(),
       stage_before_ghost = case when $2 = 'ghosting' then stage else stage_before_ghost end,
       lost_reason = case when $2 = 'lost' then coalesce($3, lost_reason) else lost_reason end,
       followup_count = case when $2 in ('qualified','meeting','met','proposal','negotiation','won') then 0 else followup_count end
     where id = $1`,
    [id, stage, reason ?? null],
  );
  await logActivity(id, "stage", `Tahap: ${cur.stage} → ${stage}`, { from: cur.stage, to: stage, reason: reason ?? null }, actor);
  // closed stages stop every pending automation
  if (["won", "lost"].includes(stage)) await cancelTasks(id, ["followup", "revive", "nurture", "intro"]);
}
export async function deleteLead(id: number): Promise<void> {
  await q("delete from p_lead where id = $1", [id]);
}

// ── contacts ─────────────────────────────────────────────────────────────────────────────────
export async function listContacts(leadId: number): Promise<Contact[]> {
  return q<Contact>("select * from p_contact where lead_id = $1 order by is_primary desc, id", [leadId]);
}
export async function addContact(leadId: number, c: Partial<Contact>): Promise<Contact> {
  const phone = normPhone(c.phone);
  const email = c.email?.trim().toLowerCase() || null;
  const has = await q1<{ n: number }>("select count(*)::int n from p_contact where lead_id = $1", [leadId]);
  const r = await q1<Contact>(
    "insert into p_contact(lead_id, name, title, phone, email, is_primary) values ($1,$2,$3,$4,$5,$6) returning *",
    [leadId, c.name?.trim() || null, c.title?.trim() || null, phone, email, c.is_primary ?? (has?.n ?? 0) === 0],
  );
  return r!;
}
export async function updateContact(id: number, c: Partial<Contact>): Promise<void> {
  await q("update p_contact set name = coalesce($2, name), title = coalesce($3, title), phone = coalesce($4, phone), email = coalesce($5, email) where id = $1",
    [id, c.name ?? null, c.title ?? null, normPhone(c.phone) ?? null, c.email?.toLowerCase() ?? null]);
}
export async function findContactByPhone(phone: string): Promise<Contact | null> {
  return q1<Contact>("select * from p_contact where phone = $1 order by id limit 1", [normPhone(phone)]);
}
export async function findContactByEmail(email: string): Promise<Contact | null> {
  return q1<Contact>("select * from p_contact where lower(email) = lower($1) order by id limit 1", [email.trim()]);
}

// ── conversations & messages ─────────────────────────────────────────────────────────────────
const CONV_SELECT = `
  select v.*, l.company, l.stage, l.needs_human, l.autopilot, c.name contact_name, c.phone contact_phone, c.email contact_email
  from p_conversation v join p_lead l on l.id = v.lead_id left join p_contact c on c.id = v.contact_id`;
export async function listConversations(opts: { channel?: string; leadId?: number } = {}): Promise<Conversation[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.channel) { params.push(opts.channel); where.push(`v.channel = $${params.length}`); }
  if (opts.leadId) { params.push(opts.leadId); where.push(`v.lead_id = $${params.length}`); }
  return q<Conversation>(`${CONV_SELECT} ${where.length ? `where ${where.join(" and ")}` : ""} order by v.last_message_at desc nulls last limit 500`, params);
}
export async function getConversation(id: number): Promise<Conversation | null> {
  return q1<Conversation>(`${CONV_SELECT} where v.id = $1`, [id]);
}
export async function ensureConversation(leadId: number, contactId: number | null, channel: "wa" | "email", externalId: string | null, subject?: string | null): Promise<Conversation> {
  if (externalId) {
    const ex = await q1<Conversation>("select * from p_conversation where channel = $1 and external_id = $2", [channel, externalId]);
    if (ex) return ex;
  } else {
    const ex = await q1<Conversation>("select * from p_conversation where lead_id = $1 and channel = $2 and coalesce(contact_id, 0) = coalesce($3, 0) order by id desc limit 1", [leadId, channel, contactId]);
    if (ex) return ex;
  }
  const r = await q1<Conversation>(
    "insert into p_conversation(lead_id, contact_id, channel, external_id, subject) values ($1,$2,$3,$4,$5) on conflict do nothing returning *",
    [leadId, contactId, channel, externalId, subject ?? null],
  );
  return r ?? (await q1<Conversation>("select * from p_conversation where channel = $1 and external_id = $2", [channel, externalId]))!;
}
export async function setConversationExternal(id: number, externalId: string, subject?: string | null) {
  await q("update p_conversation set external_id = coalesce(external_id, $2), subject = coalesce(subject, $3) where id = $1", [id, externalId, subject ?? null]);
}
export async function listMessages(conversationId: number, limit = 300): Promise<Message[]> {
  return q<Message>("select * from (select * from p_message where conversation_id = $1 order by created_at desc limit $2) x order by created_at", [conversationId, limit]);
}
export async function addMessage(m: {
  conversation_id: number; lead_id: number; direction: "in" | "out"; author: string; body: string | null; html?: string | null;
  attachments?: unknown[]; external_id?: string | null; status?: string; error?: string | null; meta?: Record<string, unknown>; created_at?: string | null;
}): Promise<Message | null> {
  const r = await q1<Message>(
    `insert into p_message(conversation_id, lead_id, direction, author, body, html, attachments, external_id, status, error, meta, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, coalesce($12::timestamptz, now()))
     on conflict do nothing returning *`,
    [m.conversation_id, m.lead_id, m.direction, m.author, m.body, m.html ?? null, JSON.stringify(m.attachments ?? []), m.external_id ?? null,
     m.status ?? "sent", m.error ?? null, JSON.stringify(m.meta ?? {}), m.created_at ?? null],
  );
  if (!r) return null; // duplicate external id (webhook retry / echo)
  const preview = (m.body ?? (m.attachments?.length ? "[lampiran]" : "")).replace(/\s+/g, " ").slice(0, 140);
  await q(
    `update p_conversation set last_message_at = greatest(coalesce(last_message_at, 'epoch'), $2), last_preview = $3,
       unread = case when $4 = 'in' then unread + 1 else unread end where id = $1`,
    [m.conversation_id, r.created_at, preview, m.direction],
  );
  await q(
    `update p_lead set ${m.direction === "in" ? "last_inbound_at" : "last_outbound_at"} = now(), updated_at = now() where id = $1`,
    [m.lead_id],
  );
  return r;
}
export async function updateMessage(id: number, patch: { status?: string; external_id?: string | null; error?: string | null }) {
  await q("update p_message set status = coalesce($2, status), external_id = coalesce($3, external_id), error = $4 where id = $1", [id, patch.status ?? null, patch.external_id ?? null, patch.error ?? null]);
}
export async function markRead(conversationId: number) {
  await q("update p_conversation set unread = 0 where id = $1", [conversationId]);
}
export async function setConversationMode(id: number, mode: "auto" | "manual", hours?: number) {
  await q("update p_conversation set mode = $2, manual_until = case when $2 = 'manual' and $3::int is not null then now() + make_interval(hours => $3::int) else null end where id = $1", [id, mode, hours ?? null]);
}

// ── meetings ─────────────────────────────────────────────────────────────────────────────────
export async function listMeetings(from: string, to: string): Promise<Meeting[]> {
  return q<Meeting>(
    "select m.*, l.company from p_meeting m join p_lead l on l.id = m.lead_id where m.start_at >= $1 and m.start_at < $2 order by m.start_at",
    [from, to],
  );
}
export async function leadMeetings(leadId: number): Promise<Meeting[]> {
  return q<Meeting>("select * from p_meeting where lead_id = $1 order by start_at desc", [leadId]);
}
export async function getMeeting(id: number): Promise<Meeting | null> {
  return q1<Meeting>("select m.*, l.company from p_meeting m join p_lead l on l.id = m.lead_id where m.id = $1", [id]);
}
export async function busyMeetings(from: Date, to: Date): Promise<{ start_at: string; end_at: string }[]> {
  return q("select start_at, end_at from p_meeting where status in ('scheduled','proposed') and end_at > $1 and start_at < $2", [from.toISOString(), to.toISOString()]);
}

// ── tasks (scheduler) ────────────────────────────────────────────────────────────────────────
export async function addTask(leadId: number, kind: string, dueAt: Date, payload: Record<string, unknown> = {}, conversationId?: number | null) {
  await q("insert into p_task(lead_id, conversation_id, kind, due_at, payload) values ($1,$2,$3,$4,$5)", [leadId, conversationId ?? null, kind, dueAt.toISOString(), JSON.stringify(payload)]);
}
export async function cancelTasks(leadId: number, kinds: string[]) {
  await q("update p_task set status = 'cancelled', done_at = now() where lead_id = $1 and status = 'pending' and kind = any($2)", [leadId, kinds]);
}
export async function hasPendingTask(leadId: number, kind: string): Promise<boolean> {
  return !!(await q1("select 1 from p_task where lead_id = $1 and kind = $2 and status = 'pending' limit 1", [leadId, kind]));
}
export async function claimDueTasks(limit = 25): Promise<Task[]> {
  return q<Task>(
    `update p_task set status = 'running', attempts = attempts + 1 where id in (
       select id from p_task where status = 'pending' and due_at <= now() order by due_at limit $1 for update skip locked)
     returning *`,
    [limit],
  );
}
export async function finishTask(id: number, status: "done" | "failed" | "pending" | "cancelled", result?: string, retryAt?: Date) {
  await q("update p_task set status = $2, result = $3, done_at = case when $2 in ('done','failed','cancelled') then now() else null end, due_at = coalesce($4, due_at) where id = $1",
    [id, status, result?.slice(0, 500) ?? null, retryAt?.toISOString() ?? null]);
}
export async function listTasks(opts: { from?: string; to?: string; leadId?: number; limit?: number } = {}): Promise<Task[]> {
  const where = ["t.status = 'pending'"];
  const params: unknown[] = [];
  if (opts.from) { params.push(opts.from); where.push(`t.due_at >= $${params.length}`); }
  if (opts.to) { params.push(opts.to); where.push(`t.due_at < $${params.length}`); }
  if (opts.leadId) { params.push(opts.leadId); where.push(`t.lead_id = $${params.length}`); }
  params.push(opts.limit ?? 500);
  return q<Task>(`select t.*, l.company from p_task t join p_lead l on l.id = t.lead_id where ${where.join(" and ")} order by t.due_at limit $${params.length}`, params);
}

// ── knowledge base ───────────────────────────────────────────────────────────────────────────
export async function listKb(activeOnly = false): Promise<KbEntry[]> {
  const n = await q1<{ n: number }>("select count(*)::int n from p_kb");
  if ((n?.n ?? 0) === 0) {
    for (const k of KB_SEED) await q("insert into p_kb(title, product, content, updated_by) values ($1,$2,$3,'seed')", [k.title, k.product, k.content]);
  }
  return q<KbEntry>(`select * from p_kb ${activeOnly ? "where active" : ""} order by product, id`);
}
export async function saveKb(e: { id?: number; title: string; product: string; content: string; active: boolean }, actor: string) {
  if (e.id) await q("update p_kb set title=$2, product=$3, content=$4, active=$5, updated_by=$6, updated_at=now() where id=$1", [e.id, e.title, e.product, e.content, e.active, actor]);
  else await q("insert into p_kb(title, product, content, active, updated_by) values ($1,$2,$3,$4,$5)", [e.title, e.product, e.content, e.active, actor]);
}
export async function deleteKb(id: number) {
  await q("delete from p_kb where id = $1", [id]);
}

// ── stats ────────────────────────────────────────────────────────────────────────────────────
export async function agentStats() {
  return q1<Record<string, number>>(
    `select
      (select count(*)::int from p_message where author = 'ai' and created_at > now() - interval '24 hours') ai_24h,
      (select count(*)::int from p_message where direction = 'in' and created_at > now() - interval '24 hours') in_24h,
      (select count(*)::int from p_lead where needs_human) needs_human,
      (select count(*)::int from p_meeting where status = 'scheduled' and start_at > now()) upcoming_meetings,
      (select count(*)::int from p_meeting where created_by = 'ai' and created_at > now() - interval '30 days') ai_meetings_30d,
      (select count(*)::int from p_lead where stage = 'ghosting') ghosting,
      (select count(*)::int from p_task where status = 'pending') pending_tasks,
      (select count(*)::int from p_task where status = 'failed' and done_at > now() - interval '7 days') failed_tasks_7d`,
  );
}
