import "server-only";
import { normPhone } from "./types";

/**
 * WAHA (WhatsApp HTTP API) on the socmed VPS — https://waha.20fit.id, session WAHA_SESSION
 * ("partnership"). Incoming events arrive at /api/partnership/webhooks/waha with the
 * X-Partner-Secret header (WAHA_WEBHOOK_SECRET) configured on the session.
 */

const BASE = () => (process.env.WAHA_URL || "https://waha.20fit.id").replace(/\/+$/, "");
const KEY = () => process.env.WAHA_API_KEY || "";
export const SESSION = () => process.env.WAHA_SESSION || "partnership";
export const wahaConfigured = () => !!process.env.WAHA_API_KEY;

async function call<T>(path: string, init: { method?: string; body?: unknown; raw?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const r = await fetch(BASE() + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "X-Api-Key": KEY(), ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
  if (init.raw) return r as unknown as T;
  const text = await r.text();
  let j: unknown = null;
  try { j = text ? JSON.parse(text) : null; } catch { j = text; }
  if (!r.ok) throw new Error(`WAHA ${r.status}: ${typeof j === "object" && j && "message" in j ? String((j as { message: unknown }).message) : String(text).slice(0, 200)}`);
  return j as T;
}

export interface WahaSession { name: string; status: string; me?: { id?: string; pushName?: string } | null; config?: Record<string, unknown> }

export function webhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://crm.20fit.id").replace(/\/+$/, "");
  return `${base}/api/partnership/webhooks/waha`;
}

function sessionConfig() {
  return {
    webhooks: [{
      url: webhookUrl(),
      events: ["message.any", "message.ack", "session.status"],
      customHeaders: [{ name: "X-Partner-Secret", value: process.env.WAHA_WEBHOOK_SECRET || "" }],
      retries: { policy: "exponential", delaySeconds: 2, attempts: 6 },
    }],
    noweb: { markOnline: false, store: { enabled: true, fullSync: false } },
  };
}

export async function getSession(): Promise<WahaSession | null> {
  try {
    return await call<WahaSession>(`/api/sessions/${SESSION()}`);
  } catch (e) {
    if (String((e as Error).message).includes("404")) return null;
    throw e;
  }
}

/** Create (or re-config + start) the partnership session with our webhook. Idempotent. */
export async function ensureSession(): Promise<WahaSession> {
  const s = await getSession();
  if (!s) return call<WahaSession>("/api/sessions", { body: { name: SESSION(), start: true, config: sessionConfig() } });
  await call(`/api/sessions/${SESSION()}`, { method: "PUT", body: { name: SESSION(), config: sessionConfig() } });
  if (["STOPPED", "FAILED"].includes(s.status)) await call(`/api/sessions/${SESSION()}/restart`, { method: "POST", body: {} });
  return (await getSession())!;
}

export async function logoutSession(): Promise<void> {
  await call(`/api/sessions/${SESSION()}/logout`, { method: "POST", body: {} });
}

export async function qrPng(): Promise<Response> {
  return call<Response>(`/api/${SESSION()}/auth/qr?format=image`, { raw: true });
}

export function chatIdFor(phone: string): string | null {
  const p = normPhone(phone);
  return p ? `${p}@c.us` : null;
}

/** Resolve a @lid sender to a phone number when WAHA knows it. */
export async function phoneFromChatId(chatId: string): Promise<string | null> {
  if (chatId.endsWith("@c.us") || chatId.endsWith("@s.whatsapp.net")) return normPhone(chatId.split("@")[0]);
  if (chatId.endsWith("@lid")) {
    try {
      const r = await call<{ lid?: string; pn?: string | null }>(`/api/${SESSION()}/lids/${encodeURIComponent(chatId)}`);
      return r?.pn ? normPhone(r.pn.split("@")[0]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function checkNumber(phone: string): Promise<{ exists: boolean; chatId: string | null }> {
  const p = normPhone(phone);
  if (!p) return { exists: false, chatId: null };
  try {
    const r = await call<{ numberExists: boolean; chatId?: string }>(`/api/contacts/check-exists?phone=${p}&session=${SESSION()}`);
    return { exists: !!r.numberExists, chatId: r.chatId ?? `${p}@c.us` };
  } catch {
    return { exists: true, chatId: `${p}@c.us` }; // unknown → let the send decide
  }
}

/** Send a text with a short human-like typing pause. Returns the WhatsApp message id. */
export async function sendText(chatId: string, text: string, opts: { typing?: boolean } = {}): Promise<string | null> {
  if (opts.typing !== false) {
    await call("/api/sendSeen", { body: { session: SESSION(), chatId } }).catch(() => undefined);
    await call("/api/startTyping", { body: { session: SESSION(), chatId } }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, Math.min(6000, 1200 + text.length * 25)));
    await call("/api/stopTyping", { body: { session: SESSION(), chatId } }).catch(() => undefined);
  }
  const r = await call<{ id?: string | { _serialized?: string }; key?: { id?: string } }>("/api/sendText", { body: { session: SESSION(), chatId, text } });
  const id = typeof r?.id === "string" ? r.id : r?.id?._serialized ?? r?.key?.id ?? null;
  return id;
}

export interface WahaMessageEvent {
  event: string;
  session: string;
  payload: {
    id: string;
    timestamp?: number;
    from: string;
    to?: string;
    fromMe: boolean;
    body?: string;
    hasMedia?: boolean;
    media?: { url?: string; mimetype?: string; filename?: string } | null;
    ack?: number;
    participant?: string | null;
    _data?: { notifyName?: string; pushName?: string; message?: Record<string, unknown> } & Record<string, unknown>;
    type?: string;
    status?: string;
  };
}

/** What kind of WhatsApp message this is (for the agent prompt). */
export function describeMedia(p: WahaMessageEvent["payload"]): string | null {
  if (!p.hasMedia && !p.media) return null;
  const mt = p.media?.mimetype ?? "";
  if (mt.startsWith("audio/")) return "[pesan suara]";
  if (mt.startsWith("image/")) return "[gambar]";
  if (mt.startsWith("video/")) return "[video]";
  if (mt === "application/pdf") return `[dokumen PDF${p.media?.filename ? `: ${p.media.filename}` : ""}]`;
  return `[lampiran${p.media?.filename ? `: ${p.media.filename}` : ""}]`;
}
