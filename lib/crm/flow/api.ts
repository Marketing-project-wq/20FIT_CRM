import "server-only";
import { c360Fetch, c360Live } from "@/lib/c360";
import type { EnrollmentRow, FlowDetail, FlowSummary } from "./types";

/** Thin client for the flow engine in c360-api (/api/flow/*). Server-only: the c360 token never leaves. */

export class FlowApiError extends Error {}

async function call<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!c360Live()) throw new FlowApiError("c360_not_configured");
  const r = await c360Fetch(`/api/flow/${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new FlowApiError(j?.error ?? `c360 ${r.status}`);
  return j;
}

export const flowApi = {
  list: () => call<{ flows: FlowSummary[] }>("list"),
  get: (id: string) => call<FlowDetail>(`get?id=${encodeURIComponent(id)}`),
  save: (flow: unknown, by: string | null) =>
    call<{ ok: boolean; errors?: string[]; warnings?: string[]; flow?: { id: string; version: number } }>("save", { body: { flow, by } }),
  status: (id: string, status: string, by: string | null) =>
    call<{ ok: boolean; errors?: string[] }>("status", { body: { id, status, by } }),
  remove: (id: string) => call<{ ok: boolean; error?: string }>("delete", { body: { id } }),
  preview: (id: string, graph?: unknown) =>
    call<{ count: number; sample: { email: string; nama: string | null; ref: string; ctx: Record<string, unknown> }[] }>("preview", { body: { id, graph }, timeoutMs: 90_000 }),
  testStart: (id: string, email: string) => call<{ enrollment_id: number; profil: string | null }>("test-start", { body: { id, email } }),
  enrollments: (id: string, test: boolean) => call<{ rows: EnrollmentRow[] }>(`enrollments?id=${encodeURIComponent(id)}${test ? "&test=1" : ""}`),
  tick: (mode: "full" | "advance" = "full") => call<TickResult>("tick", { method: "POST", body: { mode }, timeoutMs: 150_000 }),
  ack: (results: AckResult[]) => call<{ updated: number }>("ack", { body: { results } }),
  events: (rows: EventRow[]) => call<{ updated: number }>("events", { body: { rows }, timeoutMs: 90_000 }),
  seed: (flows: unknown[], by: string | null) => call<{ inserted: number }>("seed", { body: { flows, by } }),
  seedDefault: (by: string | null) => call<{ inserted: number }>("seed-default", { body: { by } }),
};

export interface OutboxItem {
  step_id: number;
  message_key: string;
  node: string;
  transactional: boolean;
  enrollment_id: number;
  email: string;
  nama: string | null;
  ctx: Record<string, unknown> | null;
  is_test: boolean;
  flow_id: string;
  flow_name: string;
  version: number;
  content: Record<string, unknown> | null;
  kota: string | null;
}

export interface TickResult {
  enrolled: number;
  advanced: number;
  converted: number;
  errors: string[];
  outbox: OutboxItem[];
  ms: number;
}

export interface AckResult {
  step_id: number;
  outcome: "sent" | "skipped_suppressed" | "not_in_pool" | "withheld" | "failed" | "invalid_email" | "deferred";
  detail?: string | null;
  sent_at?: string | null;
}

export interface EventRow {
  key: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
}
