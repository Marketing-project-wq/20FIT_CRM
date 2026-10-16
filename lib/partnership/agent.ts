import "server-only";
import { q, q1 } from "./db";
import {
  addContact, addMessage, addTask, cancelTasks, getAgentSettings, getConversation, getLead, leadMeetings, listContacts, listKb,
  logActivity, setStage, updateLead, hasPendingTask,
} from "./repo";
import { availableSlots, bookMeeting, fmtWib, rescheduleMeeting, setMeetingStatus, wibParts, type Slot } from "./meetings";
import { conversationFor, notifyTeam, recentHistory, sendToConversation } from "./messaging";
import { STAGE_LABEL, type AgentSettings, type Contact, type Conversation, type Lead, type Stage } from "./types";

/**
 * The partnership AI agent. One call = one decision for one lead: read the profile, conversation,
 * knowledge base and free meeting slots, ask the model for a JSON decision, then apply it (send or
 * draft the reply, move the stage, book/reschedule a meeting, schedule follow-ups, hand off to a human).
 * Model: OpenRouter (SEGMENT_AI_* env), model from agent settings.
 */

export type AgentReason = "inbound" | "intro" | "followup" | "revive" | "nurture" | "post_meeting" | "no_show" | "draft";

interface Decision {
  intent: string;
  reply: string;
  subject?: string;
  send_reply: boolean;
  stage?: string | null;
  lead_update?: { company?: string; category?: string; products?: string[]; city?: string; value_estimate?: number | null; notes_append?: string } | null;
  contact_update?: { name?: string; title?: string; email?: string; phone?: string } | null;
  new_contacts?: { name?: string; title?: string; phone?: string; email?: string }[] | null;
  meeting?: { action: "none" | "propose" | "book" | "reschedule" | "cancel"; slot_id?: string | null; start_iso?: string | null; kind?: "online" | "offline"; location?: string | null; agenda?: string | null } | null;
  followup_days?: number | null;
  handoff?: { needed: boolean; reason?: string | null } | null;
  summary?: string | null;
  reasoning?: string | null;
}

export interface AgentResult { ok: boolean; sent: boolean; draft?: string; subject?: string; decision?: Decision; error?: string }

const AGENT_STAGES: Stage[] = ["contacted", "qualified", "meeting", "met", "proposal", "negotiation", "nurture", "lost"];

function inHours(h: [number, number], days?: number[]): boolean {
  const p = wibParts(new Date());
  return p.h >= h[0] && p.h < h[1] && (!days || days.includes(p.dow));
}

export function nextWindow(s: AgentSettings, from = new Date()): Date {
  for (let i = 0; i < 24 * 8; i++) {
    const t = new Date(from.getTime() + i * 3600_000);
    const p = wibParts(t);
    if (p.h >= s.proactive_hours[0] && p.h < s.proactive_hours[1] && s.proactive_days.includes(p.dow)) {
      return i === 0 ? t : new Date(t.getTime() - p.min * 60_000 + Math.floor(Math.random() * 40) * 60_000);
    }
  }
  return from;
}

async function callModel(s: AgentSettings, system: string, user: string): Promise<Decision> {
  const key = process.env.PARTNER_AI_API_KEY || process.env.SEGMENT_AI_API_KEY;
  const base = (process.env.PARTNER_AI_BASE_URL || process.env.SEGMENT_AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  if (!key) throw new Error("API key AI belum diset (SEGMENT_AI_API_KEY)");
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "HTTP-Referer": "https://crm.20fit.id", "X-Title": "20FIT Partnership Agent" },
    body: JSON.stringify({
      model: s.model || "deepseek/deepseek-chat",
      temperature: 0.4,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(`AI ${r.status}: ${j.error?.message ?? ""}`);
  const raw = j.choices?.[0]?.message?.content ?? "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI tidak mengembalikan JSON");
  return JSON.parse(m[0]) as Decision;
}

function systemPrompt(s: AgentSettings, kb: string, slots: Slot[], channel: "wa" | "email"): string {
  return `Kamu adalah ${s.persona_name}, asisten tim partnership 20FIT Group (Jakarta). Tugasmu menangani calon partner (sponsor/brand, corporate wellness, komunitas, venue/EO, media, KOL) lewat ${channel === "wa" ? "WhatsApp" : "email"}: pahami kebutuhan, tawarkan produk 20FIT yang relevan, dan jadwalkan meeting dengan tim. Kalau partner minta, tawarkan Google Meet (online) atau tatap muka.

Gaya: ${s.tone}
${channel === "wa" ? "Ini WhatsApp: maksimal 3-4 kalimat pendek, tanpa salam email, tanpa tanda tangan, boleh 1 emoji kalau pas." : `Ini email: ringkas, 1-3 paragraf pendek. Jangan tulis tanda tangan (ditambahkan otomatis).`}
Waktu sekarang: ${fmtWib(new Date())}.

PENGETAHUAN (hanya ini yang boleh kamu klaim sebagai fakta):
${kb}

SLOT MEETING KOSONG (hanya tawarkan dari daftar ini, sebut 2-3 pilihan):
${slots.length ? slots.map((x) => `${x.id}: ${x.label}`).join("\n") : "(tidak ada slot kosong — minta partner menyebut waktu yang cocok, lalu handoff)"}

TAHAP PIPELINE: ${Object.entries(STAGE_LABEL).map(([k, v]) => `${k}=${v}`).join(", ")}.

Kembalikan HANYA JSON:
{
 "intent": "interested|question|schedule|reschedule|cancel|not_interested|referral|pricing|negotiation|auto_reply|spam|smalltalk|thanks|unclear|other",
 "reply": "teks pesan yang akan dikirim ('' kalau tidak perlu membalas)",
 "subject": "subjek email (hanya untuk email baru)",
 "send_reply": true/false,
 "stage": "salah satu kunci tahap atau null (won hanya boleh diset manusia)",
 "lead_update": {"company","category":"sponsor|corporate|community|venue_eo|media|kol|other|spam","products":["sponsorship|ticket|photo|racelab|talent|arena|clinic|corporate|shop|media|academy"],"city","value_estimate":angka rupiah atau null,"notes_append":"fakta baru penting"} atau null,
 "contact_update": {"name","title","email","phone"} atau null,
 "new_contacts": [{"name","title","phone","email"}] atau [],
 "meeting": {"action":"none|propose|book|reschedule|cancel","slot_id":"S1..","start_iso":null,"kind":"online|offline","location":null,"agenda":"ringkas"},
 "followup_days": angka atau null,
 "handoff": {"needed": true/false, "reason": "kenapa butuh manusia"},
 "summary": "ringkasan lead terbaru 1-2 kalimat",
 "reasoning": "alasan singkat keputusanmu"
}
Aturan keputusan:
- "book" HANYA kalau partner sudah jelas memilih/menyetujui salah satu slot atau waktu yang ada di daftar; isi slot_id. Kalau partner menyebut waktu lain, pakai "propose" dengan slot terdekat dari daftar.
- Saat "book", reply berisi konfirmasi jadwal (undangan kalender dikirim otomatis).
- Pertanyaan harga/diskon/kontrak/legal/keluhan/negosiasi angka → handoff.needed=true; reply sopan bahwa tim akan menindaklanjuti (atau ajak meeting).
- Auto-reply / out of office → intent auto_reply, send_reply=false.
- Spam/salah sambung tidak relevan → intent spam, send_reply=false.
- Partner menolak → stage "lost" (atau "nurture" kalau "nanti dulu"), reply penutup yang sopan.
- Partner merujuk orang lain → isi new_contacts dan ucapkan terima kasih.
- Pesan suara/gambar yang tidak bisa kamu baca → minta partner menulis inti pesannya.
- Jangan mengulang pertanyaan yang sudah dijawab di riwayat. Jangan mengarang fakta.`;
}

function reasonInstruction(reason: AgentReason, lead: Lead, s: AgentSettings, extra: Record<string, unknown>): string {
  switch (reason) {
    case "intro":
      return `TUGAS: tulis pesan PERTAMA (outreach) ke ${lead.company}. Belum pernah ada percakapan. Perkenalkan 20FIT singkat, sebut 1-2 produk paling relevan untuk kategori/produk minat mereka, akhiri dengan ajakan ngobrol 30 menit (tawarkan 2 slot). Untuk email isi "subject".`;
    case "followup":
      return `TUGAS: follow-up ke-${lead.followup_count + 1} dari ${s.followup_days.length} karena belum ada balasan sejak pesan terakhir kita. Pendek, sudut pandang baru (mis. event terdekat atau manfaat spesifik), jangan menyalahkan. ${lead.followup_count + 1 >= s.followup_days.length ? "Ini follow-up terakhir: beri tahu dengan sopan kita tidak akan mengganggu lagi, pintu tetap terbuka." : ""} send_reply=true.`;
    case "revive":
      return `TUGAS: lead ini ghosting ${s.revive_after_days} hari lalu. Kirim satu pesan "buka lagi" yang ringan dengan kabar baru yang relevan. send_reply=true.`;
    case "nurture":
      return `TUGAS: lead ini dulu bilang "nanti". Sapa lagi singkat dan tanya apakah sekarang waktu yang pas. send_reply=true.`;
    case "post_meeting":
      return `TUGAS: meeting baru selesai. Catatan meeting dari tim: "${String(extra.notes ?? "(tidak ada catatan)")}". Kirim terima kasih + rangkuman langkah berikutnya. Kalau tim menyebut proposal, stage "proposal".`;
    case "no_show":
      return `TUGAS: partner tidak hadir di meeting yang dijadwalkan. Tanyakan kabar dengan sopan dan tawarkan jadwal ulang (2 slot). meeting.action "propose".`;
    case "draft":
      return `TUGAS: buat DRAFT balasan terbaik untuk pesan terakhir partner (akan diperiksa manusia).`;
    default:
      return `TUGAS: balas pesan terbaru dari partner di riwayat.`;
  }
}

function historyText(msgs: Awaited<ReturnType<typeof recentHistory>>): string {
  if (!msgs.length) return "(belum ada percakapan)";
  return msgs.map((m) => {
    const who = m.direction === "in" ? "PARTNER" : m.author === "ai" ? "KITA (AI)" : m.author.startsWith("human") ? "KITA (tim)" : "SISTEM";
    const att = m.attachments?.length ? ` ${m.attachments.map((a) => `[lampiran ${a.name ?? a.mimetype ?? ""}]`).join(" ")}` : "";
    return `[${fmtWib(m.created_at)}] ${who}: ${m.body ?? ""}${att}`;
  }).join("\n");
}

/** Which conversation the agent should write into for a proactive message (intro/follow-up). */
async function pickConversation(lead: Lead, contacts: Contact[], s: AgentSettings): Promise<Conversation | null> {
  const existing = await q1<Conversation>("select * from p_conversation where lead_id = $1 order by last_message_at desc nulls last limit 1", [lead.id]);
  if (existing) return existing;
  const primary = contacts[0];
  if (!primary) return null;
  if (primary.email) return conversationFor(lead.id, primary, "email");
  if (primary.phone && s.cold_wa_allowed) {
    const today = await q1<{ n: number }>(
      `select count(*)::int n from p_message m join p_conversation v on v.id = m.conversation_id
       where v.channel = 'wa' and m.author = 'ai' and m.direction = 'out' and m.created_at > date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
         and not exists (select 1 from p_message x where x.conversation_id = v.id and x.created_at < m.created_at)`,
    );
    if ((today?.n ?? 0) >= s.cold_wa_daily_limit) return null;
    return conversationFor(lead.id, primary, "wa");
  }
  return null;
}

export async function runAgent(leadId: number, reason: AgentReason, opts: { conversationId?: number | null; extra?: Record<string, unknown> } = {}): Promise<AgentResult> {
  const s = await getAgentSettings();
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, sent: false, error: "lead tidak ada" };
  const contacts = await listContacts(leadId);
  let conv = opts.conversationId ? await getConversation(opts.conversationId) : null;
  if (!conv) conv = await pickConversation(lead, contacts, s);
  if (!conv) {
    if (reason !== "draft") {
      await updateLead(leadId, { needs_human: true, handoff_reason: "Kontak belum punya email/WA yang bisa dihubungi (atau batas WA dingin harian tercapai)" }, "ai");
      await logActivity(leadId, "handoff", "AI tidak bisa menghubungi: kontak belum lengkap", {}, "ai");
    }
    return { ok: false, sent: false, error: "tidak ada kanal kontak" };
  }

  const [kbRows, slots, history, meetings] = await Promise.all([listKb(true), availableSlots(), recentHistory(conv.id, 30), leadMeetings(leadId)]);
  const kb = kbRows.map((k) => `## ${k.title}\n${k.content}`).join("\n\n").slice(0, 14_000);
  const upcoming = meetings.filter((m) => m.status === "scheduled" && +new Date(m.end_at) > Date.now());
  const user = `LEAD: ${lead.company} | kategori ${lead.category} | minat ${lead.products.join(", ") || "-"} | tahap ${lead.stage} | kota ${lead.city ?? "-"} | estimasi nilai ${lead.value_estimate ?? "-"}
Catatan: ${lead.notes ?? "-"}
Ringkasan sebelumnya: ${lead.summary ?? "-"}
Kontak: ${contacts.map((c) => `${c.name ?? "?"}${c.title ? ` (${c.title})` : ""} ${c.phone ?? ""} ${c.email ?? ""}`).join("; ") || "-"}
Meeting terjadwal: ${upcoming.map((m) => `#${m.id} ${fmtWib(m.start_at)} ${m.kind}${m.meet_url ? ` ${m.meet_url}` : ""}${m.location ? ` @ ${m.location}` : ""}`).join("; ") || "-"}
Meeting sebelumnya: ${meetings.filter((m) => m.status !== "scheduled").slice(0, 3).map((m) => `${fmtWib(m.start_at)} ${m.status}${m.outcome ? ` — ${m.outcome}` : ""}`).join("; ") || "-"}
Kanal: ${conv.channel === "wa" ? "WhatsApp" : `Email${conv.subject ? ` (subjek: ${conv.subject})` : ""}`}

RIWAYAT PERCAKAPAN:
${historyText(history)}

${reasonInstruction(reason, lead, s, opts.extra ?? {})}`;

  let d: Decision;
  try {
    d = await callModel(s, systemPrompt(s, kb, slots, conv.channel), user);
  } catch (e) {
    await logActivity(leadId, "ai_error", `AI gagal: ${(e as Error).message}`, { reason }, "ai");
    return { ok: false, sent: false, error: (e as Error).message };
  }
  if (reason === "draft") return { ok: true, sent: false, draft: d.reply, subject: d.subject, decision: d };

  const actions: string[] = [];

  // ── lead & contacts ──
  const lu = d.lead_update ?? {};
  const patch: Partial<Lead> = {};
  if (lu.company && lead.company.match(/^\+?\d[\d\s-]+$|^Lead WhatsApp|^Lead email/i)) patch.company = lu.company.slice(0, 200);
  if (lu.category && lu.category !== lead.category && (lead.category === "unknown" || lu.category === "spam")) patch.category = lu.category;
  if (lu.products?.length) patch.products = Array.from(new Set([...lead.products, ...lu.products]));
  if (lu.city && !lead.city) patch.city = lu.city;
  if (lu.value_estimate && !lead.value_estimate) patch.value_estimate = String(lu.value_estimate);
  if (lu.notes_append) patch.notes = `${lead.notes ? `${lead.notes}\n` : ""}• ${lu.notes_append}`.slice(-4000);
  if (d.summary) patch.summary = d.summary.slice(0, 600);
  if (Object.keys(patch).length) await updateLead(leadId, patch, "ai");
  if (d.contact_update && conv.contact_id) {
    const cu = d.contact_update;
    await q("update p_contact set name = coalesce(nullif($2,''), name), title = coalesce(nullif($3,''), title), email = coalesce(email, nullif(lower($4),'')) where id = $1",
      [conv.contact_id, cu.name ?? null, cu.title ?? null, cu.email ?? null]);
  }
  for (const nc of d.new_contacts ?? []) {
    if (!nc.phone && !nc.email) continue;
    const c = await addContact(leadId, { ...nc, is_primary: false });
    actions.push(`kontak baru ${c.name ?? c.email ?? c.phone}`);
    await addTask(leadId, "intro", nextWindow(s, new Date(Date.now() + 3600_000)), { contact_id: c.id, referral: true });
  }

  // ── spam / auto reply ──
  if (d.intent === "spam") {
    await updateLead(leadId, { category: "spam", autopilot: false }, "ai");
    await setStage(leadId, "lost", "ai", "spam / tidak relevan");
    await logActivity(leadId, "ai_decision", "AI menandai spam, autopilot dimatikan", { intent: d.intent, reasoning: d.reasoning }, "ai");
    return { ok: true, sent: false, decision: d };
  }

  // ── reply ──
  let sent = false;
  const freshLead = (await getLead(leadId))!;
  const convNow = (await getConversation(conv.id))!;
  const manual = convNow.mode === "manual" && (!convNow.manual_until || +new Date(convNow.manual_until) > Date.now());
  const sentToday = await q1<{ n: number }>("select count(*)::int n from p_message where conversation_id = $1 and author = 'ai' and created_at > now() - interval '24 hours'", [conv.id]);
  const canAuto = s.enabled && freshLead.autopilot && !manual && !freshLead.needs_human && (sentToday?.n ?? 0) < s.max_ai_messages_per_day;
  if (d.reply?.trim() && d.send_reply !== false && d.intent !== "auto_reply") {
    if (canAuto) {
      try {
        await sendToConversation(conv.id, d.reply, "ai", { subject: d.subject ?? null });
        sent = true;
        actions.push(`balasan ${conv.channel === "wa" ? "WA" : "email"} terkirim`);
      } catch (e) {
        actions.push(`kirim gagal: ${(e as Error).message}`);
      }
    } else {
      await addMessage({ conversation_id: conv.id, lead_id: leadId, direction: "out", author: "ai", body: d.reply, status: "draft", meta: { subject: d.subject ?? null, why: manual ? "mode manual" : freshLead.needs_human ? "butuh manusia" : !freshLead.autopilot ? "autopilot mati" : !s.enabled ? "agent mati" : "batas pesan harian" } });
      actions.push("draft dibuat (menunggu manusia)");
    }
  }

  // ── meeting ──
  const mt = d.meeting;
  if (mt && mt.action === "book" && (mt.slot_id || mt.start_iso)) {
    const slot = slots.find((x) => x.id === mt.slot_id) ?? (mt.start_iso ? slots.find((x) => Math.abs(+new Date(x.start) - +new Date(mt.start_iso!)) < 60_000) : undefined);
    if (slot) {
      const existing = upcoming[0];
      try {
        if (existing) {
          await rescheduleMeeting(existing.id, new Date(slot.start), "ai");
          actions.push(`meeting dipindah ke ${slot.label}`);
        } else {
          await bookMeeting({ leadId, start: new Date(slot.start), kind: mt.kind === "offline" ? "offline" : "online", location: mt.location, notes: mt.agenda ?? null, createdBy: "ai" });
          actions.push(`meeting dijadwalkan ${slot.label}`);
        }
      } catch (e) {
        actions.push(`booking gagal: ${(e as Error).message}`);
      }
    } else {
      actions.push("slot yang dipilih tidak tersedia");
      await updateLead(leadId, { needs_human: true, handoff_reason: "Partner minta waktu meeting di luar slot kosong — cek kalender & konfirmasi manual" }, "ai");
    }
  } else if (mt && mt.action === "reschedule" && upcoming[0]) {
    const slot = slots.find((x) => x.id === mt.slot_id);
    if (slot) { await rescheduleMeeting(upcoming[0].id, new Date(slot.start), "ai"); actions.push(`meeting dipindah ke ${slot.label}`); }
  } else if (mt && mt.action === "cancel" && upcoming[0]) {
    await setMeetingStatus(upcoming[0].id, "cancelled", "ai", "dibatalkan partner");
    actions.push("meeting dibatalkan");
  }

  // ── stage ──
  if (d.stage && AGENT_STAGES.includes(d.stage as Stage) && d.stage !== freshLead.stage) {
    const after = (await getLead(leadId))!;
    if (!(after.stage === "meeting" && ["qualified", "contacted"].includes(d.stage))) {
      await setStage(leadId, d.stage as Stage, "ai", d.stage === "lost" ? d.reasoning ?? undefined : undefined);
      actions.push(`tahap → ${STAGE_LABEL[d.stage]}`);
    }
  } else if (d.stage === "won") {
    await updateLead(leadId, { needs_human: true, handoff_reason: "AI menilai partner siap deal — konfirmasi & set Deal secara manual" }, "ai");
  } else if (sent && freshLead.stage === "lead") {
    await setStage(leadId, "contacted", "ai");
  }

  // ── handoff ──
  if (d.handoff?.needed) {
    await updateLead(leadId, { needs_human: true, handoff_reason: (d.handoff.reason ?? "AI minta bantuan manusia").slice(0, 300) }, "ai");
    await logActivity(leadId, "handoff", `Butuh manusia: ${d.handoff.reason ?? ""}`, { intent: d.intent }, "ai");
    await notifyTeam(`Butuh tindak lanjut: ${lead.company}`, `${d.handoff.reason ?? "AI minta bantuan manusia"}\n\nPesan terakhir partner:\n${history.filter((m) => m.direction === "in").slice(-1)[0]?.body ?? "-"}`);
    actions.push("diserahkan ke manusia");
  }

  // ── follow-up scheduling ──
  const after = (await getLead(leadId))!;
  if (sent && ["lead", "contacted", "qualified", "proposal", "negotiation", "met"].includes(after.stage) && !(await hasPendingTask(leadId, "followup"))) {
    const idx = reason === "followup" ? Math.min(after.followup_count, s.followup_days.length - 1) : 0;
    const days = d.followup_days && d.followup_days > 0 && d.followup_days <= 30 ? d.followup_days : s.followup_days[idx] ?? s.followup_days[0];
    await addTask(leadId, "followup", nextWindow(s, new Date(Date.now() + days * 86400_000)), {}, conv.id);
    actions.push(`follow-up dalam ${days} hari`);
  }
  if (["lost", "won"].includes(after.stage)) await cancelTasks(leadId, ["followup", "revive"]);
  if (after.stage === "nurture" && !(await hasPendingTask(leadId, "nurture"))) await addTask(leadId, "nurture", nextWindow(s, new Date(Date.now() + s.nurture_after_days * 86400_000)), {}, conv.id);

  await logActivity(leadId, "ai_decision", `AI (${reason}) — ${d.intent}${actions.length ? `: ${actions.join(", ")}` : ""}`, {
    intent: d.intent, reasoning: d.reasoning ?? null, actions, reply: d.reply?.slice(0, 500) ?? null, conversation_id: conv.id, channel: conv.channel,
  }, "ai");
  return { ok: true, sent, decision: d };
}

export { inHours };

/** Playground: what would the agent answer to `text` from a fictional lead? No side effects. */
export async function simulateAgent(input: { text: string; channel: "wa" | "email"; category: string; company: string; history?: { from: "partner" | "kita"; text: string }[] }): Promise<Decision> {
  const s = await getAgentSettings();
  const [kbRows, slots] = await Promise.all([listKb(true), availableSlots()]);
  const kb = kbRows.map((k) => `## ${k.title}\n${k.content}`).join("\n\n").slice(0, 14_000);
  const hist = [...(input.history ?? []), { from: "partner" as const, text: input.text }]
    .map((h) => `[${fmtWib(new Date())}] ${h.from === "partner" ? "PARTNER" : "KITA (AI)"}: ${h.text}`).join("\n");
  const user = `LEAD: ${input.company} | kategori ${input.category} | tahap qualified\nKanal: ${input.channel === "wa" ? "WhatsApp" : "Email"}\n\nRIWAYAT PERCAKAPAN:\n${hist}\n\nTUGAS: balas pesan terbaru dari partner di riwayat.`;
  return callModel(s, systemPrompt(s, kb, slots, input.channel), user);
}
