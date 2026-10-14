/**
 * Keep the expensive CRM aggregates warm so no page waits on a cold read (owner 2026-10-14: "load nya
 * bikin lebih cepat di semua page"). First warm 5 s after boot, then every 4 minutes — inside every TTL,
 * so the stale-while-revalidate cache (lib/crm/server-cache.ts) always has a value to serve.
 */
import { warmCaches } from "./lib/crm/cached-loaders";

if (process.env.NODE_ENV === "production" && process.env.CRM_CACHE_WARM !== "off") {
  const run = () => void warmCaches().catch(() => {});
  setTimeout(run, 5_000);
  setInterval(run, 4 * 60_000).unref?.();
}
