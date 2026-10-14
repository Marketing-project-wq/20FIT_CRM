import "server-only";

/**
 * Customer 360 / LTV — the same dashboard as admin.20fit.id/data, served by the `c360-api` service
 * (Railway project "20FIT Database", database data20fit: Ticket, Photo, Supabase, POS, form, PLN, B2B
 * pipeline, Master Data sheet; refreshed automatically every ~5–10 min). That service requires
 * `Authorization: Bearer C360_API_TOKEN`; the browser never sees the token — everything goes through the
 * session-gated proxy at /api/c360/*.
 */
const BASE = (process.env.C360_API_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.C360_API_TOKEN || "";

export const c360Live = () => !!(BASE && TOKEN);

/** Call c360-api. `path` starts with "/" (e.g. "/api/meta"). */
export function c360Fetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!c360Live()) throw new Error("C360_API_URL / C360_API_TOKEN not set");
  return fetch(BASE + path, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), authorization: `Bearer ${TOKEN}` },
  });
}
