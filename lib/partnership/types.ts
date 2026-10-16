/**
 * Partnership pipeline — shared vocabulary for the UI and the server. Data lives in the Postgres
 * service "Postgres" inside the CRM Railway project (PARTNER_DATABASE_URL, private network).
 */

export const STAGES = [
  { key: "lead", label: "Lead baru", hint: "Belum dihubungi" },
  { key: "contacted", label: "Dihubungi", hint: "Pesan pertama terkirim, menunggu balasan" },
  { key: "qualified", label: "Tertarik", hint: "Membalas dan menunjukkan minat" },
  { key: "meeting", label: "Meeting dijadwalkan", hint: "Ada jadwal GMeet / tatap muka" },
  { key: "met", label: "Sudah meeting", hint: "Meeting selesai, menunggu langkah berikutnya" },
  { key: "proposal", label: "Proposal", hint: "Proposal / penawaran dikirim" },
  { key: "negotiation", label: "Negosiasi", hint: "Bahas harga, kontrak, detail" },
  { key: "won", label: "Deal", hint: "Sepakat / PO / kontrak" },
  { key: "ghosting", label: "Ghosting", hint: "Tidak membalas setelah semua follow-up" },
  { key: "nurture", label: "Nanti", hint: "Belum sekarang, dihubungi lagi nanti" },
  { key: "lost", label: "Batal", hint: "Tidak jadi / menolak / tidak relevan" },
] as const;
export type Stage = (typeof STAGES)[number]["key"];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
export const OPEN_STAGES: Stage[] = ["lead", "contacted", "qualified", "meeting", "met", "proposal", "negotiation"];

export const CATEGORIES: Record<string, string> = {
  sponsor: "Sponsor & brand collab",
  corporate: "Corporate wellness",
  community: "Komunitas",
  venue_eo: "Venue / EO",
  media: "Media partner",
  kol: "Talent / KOL",
  other: "Lainnya",
  unknown: "Belum jelas",
  spam: "Spam",
};

export const PRODUCTS: Record<string, string> = {
  sponsorship: "Sponsorship event",
  ticket: "Ticket (platform tiket EO)",
  photo: "Photo (foto & face search)",
  racelab: "Race Lab (timing)",
  talent: "Talent / KOL / manpower",
  arena: "Arena (venue & kelas)",
  clinic: "Sports Clinic / booth medis",
  corporate: "Corporate wellness",
  shop: "Shop (alat gym)",
  media: "Media & konten",
  academy: "Academy (sertifikasi coach)",
};

export interface Lead {
  id: number;
  company: string;
  category: string;
  products: string[];
  stage: Stage;
  value_estimate: string | null;
  owner_email: string | null;
  source: string;
  priority: "low" | "normal" | "high";
  city: string | null;
  website: string | null;
  notes: string | null;
  lost_reason: string | null;
  tags: string[];
  autopilot: boolean;
  needs_human: boolean;
  handoff_reason: string | null;
  followup_count: number;
  next_action_at: string | null;
  next_action: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  // joined
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  next_meeting_at?: string | null;
  unread?: number;
}

export interface Contact {
  id: number;
  lead_id: number;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface Conversation {
  id: number;
  lead_id: number;
  contact_id: number | null;
  channel: "wa" | "email";
  external_id: string | null;
  subject: string | null;
  mode: "auto" | "manual";
  manual_until: string | null;
  unread: number;
  last_message_at: string | null;
  last_preview: string | null;
  // joined
  company?: string;
  stage?: Stage;
  needs_human?: boolean;
  autopilot?: boolean;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  lead_id: number;
  direction: "in" | "out";
  author: string; // partner | ai | human:<email> | system
  body: string | null;
  attachments: { name?: string; mimetype?: string; url?: string }[];
  status: string;
  error: string | null;
  created_at: string;
  meta: Record<string, unknown>;
}

export interface Meeting {
  id: number;
  lead_id: number;
  title: string;
  start_at: string;
  end_at: string;
  kind: "online" | "offline";
  location: string | null;
  meet_url: string | null;
  google_event_id: string | null;
  status: "proposed" | "scheduled" | "done" | "no_show" | "cancelled";
  attendees: { email?: string; name?: string }[];
  notes: string | null;
  outcome: string | null;
  created_by: string | null;
  company?: string;
}

export interface Activity {
  id: number;
  lead_id: number;
  kind: string;
  title: string;
  detail: Record<string, unknown>;
  actor: string;
  at: string;
  company?: string;
}

export interface Task {
  id: number;
  lead_id: number;
  conversation_id: number | null;
  kind: string;
  due_at: string;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
  company?: string;
}

export interface KbEntry {
  id: number;
  title: string;
  product: string;
  content: string;
  active: boolean;
  updated_at: string;
}

export interface AgentSettings {
  enabled: boolean;
  persona_name: string;
  signature: string;
  tone: string;
  followup_days: number[];
  revive_after_days: number;
  nurture_after_days: number;
  proactive_hours: [number, number];
  proactive_days: number[]; // 0=Min … 6=Sab
  reply_hours: [number, number];
  manual_takeover_hours: number;
  cold_wa_allowed: boolean;
  cold_wa_daily_limit: number;
  max_ai_messages_per_day: number;
  meeting_minutes: number;
  meeting_hours: [number, number];
  meeting_days: number[];
  meeting_buffer_min: number;
  offline_locations: string[];
  notify_email: string;
  email_from: string;
  email_reply_to: string;
  /** Outbound partner email: "resend" (default, from email_from, Reply-To = the connected Gmail so replies
   *  come back into the inbox) or "gmail" (sent from the connected mailbox itself). */
  email_via: "resend" | "gmail";
  model: string;
}

export const DEFAULT_SETTINGS: AgentSettings = {
  enabled: true,
  persona_name: "Tim Partnership 20FIT",
  signature: "Salam,\nTim Partnership 20FIT\n20fit.id",
  tone: "Ramah, profesional, singkat. Bahasa Indonesia santai-sopan (pakai 'Kak'/'Bapak/Ibu' sesuai lawan bicara); balas dalam bahasa yang dipakai partner.",
  followup_days: [2, 5, 10],
  revive_after_days: 45,
  nurture_after_days: 90,
  proactive_hours: [8, 19],
  proactive_days: [1, 2, 3, 4, 5, 6],
  reply_hours: [6, 22],
  manual_takeover_hours: 24,
  cold_wa_allowed: true,
  cold_wa_daily_limit: 15,
  max_ai_messages_per_day: 8,
  meeting_minutes: 30,
  meeting_hours: [10, 17],
  meeting_days: [1, 2, 3, 4, 5],
  meeting_buffer_min: 15,
  offline_locations: [
    "20FIT Arena — Menteng Prada, Jl. Pegangsaan Timur No.15A, Menteng, Jakarta Pusat",
    "20FIT Kebayoran — Jl. Sinabung No. 9, Kebayoran Baru, Jakarta Selatan",
  ],
  notify_email: "luthfi@20fit.id",
  email_from: "20FIT Partnership <partnership@20fit.id>",
  email_reply_to: "",
  email_via: "resend",
  model: "deepseek/deepseek-chat",
};

export const TASK_LABEL: Record<string, string> = {
  agent_reply: "AI membalas",
  intro: "Pesan pertama",
  followup: "Follow-up",
  revive: "Hubungi lagi (ghosting)",
  nurture: "Hubungi lagi (nanti)",
  meeting_reminder: "Pengingat meeting",
  meeting_check: "Cek hasil meeting",
};

export const fmtIdr = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "–";
  if (n >= 1e9) return `Rp${(n / 1e9).toFixed(1)} M`;
  if (n >= 1e6) return `Rp${(n / 1e6).toFixed(0)} jt`;
  return `Rp${Math.round(n / 1e3)} rb`;
};

/** 08xx / +62 8xx / 628xx → 628xx (digits only). */
export function normPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^0-9]/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = `62${d.slice(1)}`;
  else if (d.startsWith("8")) d = `62${d}`;
  return d.length >= 9 && d.length <= 15 ? d : null;
}
