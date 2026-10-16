/**
 * Flow (journey automation) — shared shapes for the builder UI and the server. The ENGINE lives in
 * c360-api (Database/dashboard/flow.mjs, data in data20fit schema `flow`); the CRM renders the builder,
 * sends the emails through its own send path, and feeds open/click stamps back. Keep these types in
 * step with that file's header comment.
 */

export type FlowStatus = "draft" | "test" | "active" | "paused";

export type Rule =
  | { kind: "opened" | "clicked"; node: string }
  | { kind: "purchased"; lines?: string[]; produk_like?: string; ctx_line?: boolean; since_days?: number }
  | { kind: "attr"; field: string; op: string; value?: unknown }
  | { kind: "ctx"; key: string; op: string; value?: unknown }
  | { kind: "all" | "any"; rules: Rule[] }
  | { kind: "not"; rule: Rule };

export interface EmailNode {
  type: "email";
  name?: string;
  subject: string;
  preheader?: string;
  headline?: string;
  body?: string;
  cta_label?: string;
  cta_url?: string;
  promo_code?: string;
  requires_promo?: boolean;
  transactional?: boolean;
  next?: string | null;
}
export interface WaitNode { type: "wait"; days?: number; hours?: number; minutes?: number; next?: string | null }
export interface ConditionNode { type: "condition"; label?: string; rule: Rule; yes?: string | null; no?: string | null }
export interface SplitNode {
  type: "split";
  branches: { label: string; rule: Rule; next?: string | null }[];
  else_label?: string;
  else?: string | null;
}
export interface ExitNode { type: "exit"; label?: string }
export type FlowNode = EmailNode | WaitNode | ConditionNode | SplitNode | ExitNode;

export interface Trigger {
  kind: string;
  audience?: (Rule | { kind: "any"; rules: Rule[] })[];
  cooldown_days?: number;
  daily_cap?: number;
  exclude_b2b?: boolean;
  [param: string]: unknown;
}

export interface FlowGraph { trigger: Trigger; start: string; nodes: Record<string, FlowNode> }

export interface FlowGoal { lines?: string[]; days?: number; produk_like?: string; ctx_line?: boolean; exit_on_goal?: boolean }

export interface FlowDef {
  id: string;
  name: string;
  journey: string;
  description: string | null;
  status: FlowStatus;
  priority: number;
  holdout_pct: number;
  goal: FlowGoal | null;
  graph: FlowGraph;
  test_emails: string[];
  version: number;
  updated_at: string;
  updated_by: string | null;
  activated_at: string | null;
  last_tick_at: string | null;
}

export interface FlowSummary {
  id: string;
  name: string;
  journey: string;
  status: FlowStatus;
  priority: number;
  description: string | null;
  version: number;
  updated_at: string;
  activated_at: string | null;
  last_tick_at: string | null;
  trigger_kind: string;
  node_count: string | number;
  email_count: string | number;
  entered: string | number;
  active: string | number;
  converted: string | number;
  revenue: string | number;
  sent: string | number;
  opened: string | number;
  clicked: string | number;
}

export interface NodeStats {
  node: string;
  kind: string;
  reached: string | number;
  sent: string | number;
  queued: string | number;
  skipped: string | number;
  holdout: string | number;
  delivered: string | number;
  opened: string | number;
  clicked: string | number;
  bounced: string | number;
  unsubscribed: string | number;
  conv: string | number;
  conv_amount: string | number;
  branches: Record<string, number>;
  skips: Record<string, number>;
}

export interface FlowStats {
  totals: {
    entered: string | number;
    holdout: string | number;
    active: string | number;
    finished: string | number;
    converted: string | number;
    converted_holdout: string | number;
    revenue: string | number;
    last_entered: string | null;
  };
  nodes: Record<string, NodeStats>;
}

export interface FlowDetail {
  flow: FlowDef;
  stats: FlowStats;
  testStats: FlowStats;
  history: { version: number; status: string; changed_by: string | null; changed_at: string; note: string | null }[];
  validation: { errs: string[]; warn: string[] };
}

export interface EnrollmentRow {
  id: number;
  email: string;
  nama: string | null;
  ref: string;
  status: string;
  node: string | null;
  next_at: string;
  entered_at: string;
  finished_at: string | null;
  exit_reason: string | null;
  holdout: boolean;
  converted_at: string | null;
  conversion_amount: string | null;
  steps: { node: string; kind: string; outcome: string; at: string; opened: boolean; clicked: boolean }[] | null;
}

// ── vocab shown in the builder ─────────────────────────────────────────────────────────────────
export const JOURNEYS: Record<string, string> = {
  A: "Sambutan & identitas",
  B: "Siklus event",
  C: "Photo",
  D: "Clinic",
  E: "Arena",
  F: "App & Media",
  G: "Nilai & loyalitas",
  H: "Segmen khusus",
  I: "Umpan balik",
  X: "Lainnya",
};

export const LINES = ["TICKET", "PHOTO", "CLINIC", "ARENA", "APP", "RACELAB", "EVENT", "MERCH", "GYM", "HYROX", "PLN", "UOB", "FORM", "LEGACY"] as const;
export const LINE_LABEL: Record<string, string> = {
  TICKET: "Ticket", PHOTO: "Photo", CLINIC: "Clinic", ARENA: "Arena", APP: "App my20fit", RACELAB: "Race Lab",
  EVENT: "Event Mayar", MERCH: "Merchandise", GYM: "Gym/POS", HYROX: "HYROX", PLN: "PLN Run", UOB: "UOB Run",
  FORM: "Form 20FIT", LEGACY: "Riwayat lama", B2B: "B2B", OTHER: "Lainnya", ALL: "Semua",
};

export const TRIGGERS: Record<string, { label: string; hint: string; params: { key: string; label: string; type: "number" | "text" | "lines" | "bool" | "select"; options?: string[] }[] }> = {
  new_person: { label: "Orang baru masuk", hint: "Muncul pertama kali di Customer 360", params: [{ key: "days", label: "Dalam N hari terakhir", type: "number" }] },
  purchase: {
    label: "Pembelian lunas",
    hint: "Setiap transaksi lunas baru",
    params: [
      { key: "lines", label: "Lini produk", type: "lines" },
      { key: "produk_like", label: "Nama produk mirip (pakai %)", type: "text" },
      { key: "delay_hours", label: "Tunda (jam) setelah bayar", type: "number" },
      { key: "lookback_hours", label: "Lihat ke belakang (jam)", type: "number" },
    ],
  },
  checkout_failed: {
    label: "Checkout gagal / belum dibayar",
    hint: "Tidak ada pembayaran produk yang sama sesudahnya",
    params: [
      { key: "lines", label: "Lini produk", type: "lines" },
      { key: "delay_hours", label: "Tunggu (jam) sebelum masuk", type: "number" },
      { key: "lookback_hours", label: "Lihat ke belakang (jam)", type: "number" },
    ],
  },
  event_before: {
    label: "N hari sebelum event",
    hint: "Peserta Ticket, dihitung dari tanggal event",
    params: [
      { key: "days", label: "Hari sebelum event", type: "number" },
      { key: "event_kind", label: "Jenis", type: "select", options: ["", "EVENT", "CLASS"] },
      { key: "title_like", label: "Judul event mirip (pakai %)", type: "text" },
    ],
  },
  event_after: {
    label: "N hari setelah event",
    hint: "Peserta Ticket, dihitung dari tanggal event",
    params: [
      { key: "days", label: "Hari setelah event", type: "number" },
      { key: "checked_in", label: "Hanya yang check-in (ya/tidak/kosong)", type: "select", options: ["", "true", "false"] },
      { key: "title_like", label: "Judul event mirip (pakai %)", type: "text" },
    ],
  },
  repeat_gap: {
    label: "Belum beli lagi setelah N kali",
    hint: "Jumlah pembelian di lini + jeda sejak terakhir",
    params: [
      { key: "lines", label: "Lini produk", type: "lines" },
      { key: "count_min", label: "Jumlah beli minimal", type: "number" },
      { key: "count_max", label: "Jumlah beli maksimal", type: "number" },
      { key: "min_days", label: "Jeda minimal (hari)", type: "number" },
      { key: "max_days", label: "Jeda maksimal (hari)", type: "number" },
    ],
  },
  inactive: {
    label: "Tidak beli selama N hari",
    hint: "Pembelian terakhir di rentang hari",
    params: [
      { key: "lines", label: "Lini produk (kosong = semua)", type: "lines" },
      { key: "min_days", label: "Minimal hari", type: "number" },
      { key: "max_days", label: "Maksimal hari", type: "number" },
    ],
  },
  frequency: {
    label: "Sering beli",
    hint: "≥ N pembelian dalam D hari (sekali per bulan)",
    params: [
      { key: "lines", label: "Lini produk", type: "lines" },
      { key: "min_count", label: "Minimal pembelian", type: "number" },
      { key: "days", label: "Dalam D hari", type: "number" },
    ],
  },
  birthday: { label: "Bulan ulang tahun", hint: "Sekali per tahun di bulan lahir", params: [] },
  segment: {
    label: "Segmen (atribut)",
    hint: "Semua orang yang cocok dengan audiens",
    params: [{ key: "cadence", label: "Ulang", type: "select", options: ["once", "monthly", "biweekly"] }],
  },
  clicked_no_purchase: { label: "Klik email tapi tidak beli", hint: "Dari flow lain, tanpa pembayaran sesudah klik", params: [{ key: "hours", label: "Setelah N jam", type: "number" }] },
  engaged: { label: "Lead panas", hint: "Klik ≥ N email flow dalam D hari", params: [{ key: "clicks", label: "Minimal klik", type: "number" }, { key: "days", label: "Dalam D hari", type: "number" }] },
  sunset: { label: "Tidak membuka email", hint: "N email flow terakhir tidak dibuka", params: [{ key: "unopened", label: "Jumlah email", type: "number" }] },
};

export const ATTR_FIELDS: Record<string, { label: string; type: "text" | "num" | "bool" | "arr" | "line"; options?: string[] }> = {
  gender: { label: "Gender", type: "text", options: ["Laki-laki", "Perempuan"] },
  umur: { label: "Umur", type: "num" },
  kota: { label: "Kota", type: "text" },
  domisili: { label: "Domisili (kota / ditebak dari perilaku)", type: "text", options: ["jabodetabek", "luar", "tidak_diketahui"] },
  jabodetabek: { label: "Tinggal di Jabodetabek", type: "bool" },
  status_pembeli: { label: "Status pembeli", type: "text", options: ["Active", "At-Risk", "Dormant"] },
  segmen_ltv: { label: "Segmen LTV", type: "text" },
  ltv_b2c: { label: "LTV B2C (Rp)", type: "num" },
  ltv_b2b: { label: "LTV B2B (Rp)", type: "num" },
  jumlah_transaksi: { label: "Jumlah transaksi", type: "num" },
  hari_sejak_beli: { label: "Hari sejak beli terakhir", type: "num" },
  last_line: { label: "Lini pembelian terakhir", type: "line" },
  lines: { label: "Pernah di lini", type: "arr" },
  paid_lines: { label: "Pernah bayar di lini", type: "arr" },
  paid_lines_count: { label: "Jumlah lini dibayar", type: "num" },
  produk_dibeli: { label: "Produk dibeli", type: "arr" },
  has_app: { label: "Punya akun App", type: "bool" },
  membelikan_untuk: { label: "Membelikan untuk (orang)", type: "num" },
  dibelikan: { label: "Dibelikan orang lain", type: "bool" },
  kohort_2026: { label: "Kohort 2026", type: "text" },
  ukuran_jersey: { label: "Ukuran jersey", type: "text" },
  perusahaan: { label: "Perusahaan", type: "text" },
  tgl_lahir: { label: "Tanggal lahir", type: "text" },
};

export const OUTCOME_LABEL: Record<string, string> = {
  skipped_suppressed: "Berhenti langganan",
  not_in_pool: "Belum di pool CRM",
  withheld: "Ditahan (kirim nyata mati)",
  skipped_cold: "Terlalu dingin (G12)",
  capped: "Batas frekuensi (G02)",
  failed: "Gagal kirim",
  invalid_email: "Email tidak valid",
  holdout: "Grup kontrol",
};

export const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const pct = (a: unknown, b: unknown): string => {
  const d = toNum(b);
  if (!d) return "–";
  const v = (toNum(a) / d) * 100;
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;
};
