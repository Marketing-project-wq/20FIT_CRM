import "server-only";
import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "./repo";
import { open, seal } from "./crypto";

/**
 * Google Workspace connection for ONE partnership mailbox (OAuth, offline access):
 *   Gmail  — read incoming partner email (poll) + send replies in the same thread
 *   Calendar — create events with a Google Meet link and send invitations (sendUpdates=all)
 * Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (OAuth client "Web application", redirect URI
 * <app>/api/partnership/google/callback). The refresh token is stored sealed (PARTNER_ENC_KEY).
 */

export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${(process.env.NEXT_PUBLIC_APP_URL || "https://crm.20fit.id").replace(/\/+$/, "")}/api/partnership/google/callback`;

interface GoogleConn { email: string; refresh: string; scope: string; connected_at: string; connected_by: string | null; history_id?: string | null }

export async function getConnection(): Promise<Omit<GoogleConn, "refresh"> | null> {
  const c = await getSetting<GoogleConn | null>("google", null);
  if (!c) return null;
  const { refresh: _r, ...rest } = c;
  void _r;
  return rest;
}

export async function authUrl(): Promise<string> {
  const state = randomBytes(16).toString("hex");
  await setSetting("google_oauth_state", { state, at: Date.now() });
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function handleCallback(code: string, state: string, by: string | null): Promise<string> {
  const saved = await getSetting<{ state: string; at: number } | null>("google_oauth_state", null);
  if (!saved || saved.state !== state || Date.now() - saved.at > 15 * 60_000) throw new Error("state tidak valid / kedaluwarsa");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; scope?: string; error_description?: string; error?: string };
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "Google tidak mengembalikan refresh token");
  const me = (await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${j.access_token}` } })).json()) as { email?: string };
  await setSetting("google", { email: me.email ?? "?", refresh: seal(j.refresh_token), scope: j.scope ?? "", connected_at: new Date().toISOString(), connected_by: by, history_id: null } satisfies GoogleConn);
  tokenCache = null;
  return me.email ?? "?";
}

export async function disconnect(): Promise<void> {
  const c = await getSetting<GoogleConn | null>("google", null);
  if (c) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(open(c.refresh))}`, { method: "POST" }); } catch { /* best effort */ }
  }
  await setSetting("google", null);
  tokenCache = null;
}

let tokenCache: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const c = await getSetting<GoogleConn | null>("google", null);
  if (!c) throw new Error("Google belum tersambung");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: open(c.refresh), client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token" }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google token: ${j.error ?? r.status}`);
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3000) * 1000 };
  return j.access_token;
}

async function gapi<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${await accessToken()}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (r.status === 204) return {} as T;
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Google ${r.status}: ${j?.error?.message ?? ""}`);
  return j;
}

// ── Gmail ────────────────────────────────────────────────────────────────────────────────────
export interface GmailMsg {
  id: string;
  threadId: string;
  internalDate: string;
  labelIds?: string[];
  payload: { headers: { name: string; value: string }[]; mimeType: string; body?: { data?: string }; parts?: GmailMsg["payload"][] ; filename?: string };
}
export const header = (m: GmailMsg, name: string) => m.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

export async function listRecentMessageIds(query = "newer_than:3d -in:chats", max = 50): Promise<{ id: string; threadId: string }[]> {
  const j = await gapi<{ messages?: { id: string; threadId: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`);
  return j.messages ?? [];
}
/** Id of a user label by name (case-insensitive), or null when the mailbox has no such label. */
export async function labelId(name: string): Promise<string | null> {
  const j = await gapi<{ labels?: { id: string; name: string }[] }>("https://gmail.googleapis.com/gmail/v1/users/me/labels");
  return j.labels?.find((l) => l.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;
}
export async function getMessage(id: string): Promise<GmailMsg> {
  return gapi<GmailMsg>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (d?: string) => (d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");

/** Plain-text body of a Gmail message (text/plain part, else stripped HTML), quoted history removed. */
export function messageText(m: GmailMsg): { text: string; attachments: { name: string; mimetype: string }[] } {
  const atts: { name: string; mimetype: string }[] = [];
  let plain = "";
  let html = "";
  const walk = (p: GmailMsg["payload"]) => {
    if (p.filename) atts.push({ name: p.filename, mimetype: p.mimeType });
    else if (p.mimeType === "text/plain" && !plain) plain = decode(p.body?.data);
    else if (p.mimeType === "text/html" && !html) html = decode(p.body?.data);
    for (const c of p.parts ?? []) walk(c);
  };
  walk(m.payload);
  let text = plain || html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  // cut quoted replies ("On … wrote:" / "Pada … menulis:" / "> …")
  const cut = text.search(/\n\s*(On .{5,200} wrote:|Pada .{5,200} menulis:|-----Original Message-----|From: .+\nSent: )/i);
  if (cut > 0) text = text.slice(0, cut);
  text = text.split("\n").filter((l) => !l.trim().startsWith(">")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, attachments: atts };
}

export async function sendGmail(opts: { to: string; subject: string; text: string; html: string; threadId?: string | null; inReplyTo?: string | null; fromName?: string }): Promise<{ id: string; threadId: string }> {
  const conn = await getConnection();
  const boundary = `b${randomBytes(8).toString("hex")}`;
  const subject = `=?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`;
  const from = opts.fromName ? `=?UTF-8?B?${Buffer.from(opts.fromName, "utf8").toString("base64")}?= <${conn?.email}>` : conn?.email ?? "";
  const lines = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.text, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(opts.html, "utf8").toString("base64"),
    `--${boundary}--`,
  ];
  return gapi<{ id: string; threadId: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    body: { raw: b64url(lines.join("\r\n")), ...(opts.threadId ? { threadId: opts.threadId } : {}) },
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────────────────────────
export async function freeBusy(from: Date, to: Date): Promise<{ start: string; end: string }[]> {
  const j = await gapi<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>("https://www.googleapis.com/calendar/v3/freeBusy", {
    body: { timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: "Asia/Jakarta", items: [{ id: "primary" }] },
  });
  return j.calendars?.primary?.busy ?? [];
}

export async function createEvent(e: { title: string; description: string; start: Date; end: Date; attendees: string[]; online: boolean; location?: string | null }): Promise<{ id: string; meetUrl: string | null; htmlLink: string }> {
  const j = await gapi<{ id: string; hangoutLink?: string; htmlLink: string; conferenceData?: { entryPoints?: { uri: string; entryPointType: string }[] } }>(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
    {
      body: {
        summary: e.title,
        description: e.description,
        start: { dateTime: e.start.toISOString(), timeZone: "Asia/Jakarta" },
        end: { dateTime: e.end.toISOString(), timeZone: "Asia/Jakarta" },
        attendees: e.attendees.filter(Boolean).map((email) => ({ email })),
        location: e.online ? undefined : e.location ?? undefined,
        reminders: { useDefault: true },
        ...(e.online ? { conferenceData: { createRequest: { requestId: randomBytes(8).toString("hex"), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
      },
    },
  );
  const meet = j.hangoutLink ?? j.conferenceData?.entryPoints?.find((x) => x.entryPointType === "video")?.uri ?? null;
  return { id: j.id, meetUrl: meet, htmlLink: j.htmlLink };
}

export async function patchEvent(id: string, patch: { start?: Date; end?: Date; title?: string; status?: "cancelled" }): Promise<void> {
  if (patch.status === "cancelled") {
    await gapi(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "DELETE" });
    return;
  }
  await gapi(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, {
    method: "PATCH",
    body: {
      ...(patch.title ? { summary: patch.title } : {}),
      ...(patch.start ? { start: { dateTime: patch.start.toISOString(), timeZone: "Asia/Jakarta" } } : {}),
      ...(patch.end ? { end: { dateTime: patch.end.toISOString(), timeZone: "Asia/Jakarta" } } : {}),
    },
  });
}
