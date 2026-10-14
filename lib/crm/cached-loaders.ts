import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { c360Fetch, c360Live } from "@/lib/c360";
import { listDeliveries } from "./deliveries";
import { fetchEventAnalytics } from "./event-analytics";
import { fetchPoolTagCounts } from "./tag-vocab";
import { loadCityFill } from "./city-fill";
import {
  fetchImmediateBlock,
  fetchMirrorBlock,
  fetchEventsBlock,
  fetchSourcesBlock,
  fetchDeliveryBlock,
} from "./dashboard";
import { cachedAggregate, CACHE_KEYS } from "./server-cache";

/**
 * Every cached aggregate the screens read, in ONE place — so the screens and the warmer
 * (instrumentation.ts → warmCaches) always use the same key, TTL and loader. Shared aggregates only;
 * role checks stay in the screens. See lib/crm/server-cache.ts.
 */

export const deliveriesCached = (admin: SupabaseClient = createAdminClient()) =>
  cachedAggregate(CACHE_KEYS.deliveries, 30_000, () => listDeliveries(admin));

export const eventAnalyticsCached = (admin: SupabaseClient = createAdminClient()) =>
  cachedAggregate(CACHE_KEYS.eventAnalytics, 10 * 60_000, () => fetchEventAnalytics(admin));

export const tagVocabCached = (admin: SupabaseClient = createAdminClient()) =>
  cachedAggregate(CACHE_KEYS.tagVocab, 5 * 60_000, () => fetchPoolTagCounts(admin));

const DASHBOARD_LOADERS = {
  immediate: fetchImmediateBlock,
  mirror: fetchMirrorBlock,
  events: fetchEventsBlock,
  sources: fetchSourcesBlock,
  delivery: fetchDeliveryBlock,
} as const;
export type CachedDashboardBlock = keyof typeof DASHBOARD_LOADERS;
export const isCachedDashboardBlock = (b: string): b is CachedDashboardBlock => Object.prototype.hasOwnProperty.call(DASHBOARD_LOADERS, b);

export const dashboardBlockCached = (block: CachedDashboardBlock, admin: SupabaseClient = createAdminClient()) =>
  cachedAggregate<unknown>(CACHE_KEYS.dashboard(block), 5 * 60_000, () => (DASHBOARD_LOADERS[block] as (a: SupabaseClient) => Promise<unknown>)(admin));

/** Audience numbers from the 20FIT database (c360-api /api/crm-summary). */
export const audience360Cached = () =>
  cachedAggregate(CACHE_KEYS.audience360, 5 * 60_000, async () => {
    if (!c360Live()) throw Object.assign(new Error("c360_not_configured"), { code: "c360_not_configured" });
    const r = await c360Fetch("/api/crm-summary", { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw Object.assign(new Error("c360_summary_failed"), { code: String(r.status) });
    return (await r.json()) as unknown;
  });

/**
 * Warm every cached aggregate, one after another (gentle on Supabase). Called once shortly after boot
 * and then on an interval, so a visitor practically never waits for a cold aggregate.
 */
export async function warmCaches(): Promise<void> {
  const admin = createAdminClient();
  const jobs: [string, () => Promise<unknown>][] = [
    ["audience360", () => audience360Cached()],
    ["dashboard:delivery", () => dashboardBlockCached("delivery", admin)],
    ["dashboard:immediate", () => dashboardBlockCached("immediate", admin)],
    ["dashboard:events", () => dashboardBlockCached("events", admin)],
    ["deliveries", () => deliveriesCached(admin)],
    ["tag-vocab", () => tagVocabCached(admin)],
    ["city-fill", () => loadCityFill()],
    ["event-analytics", () => eventAnalyticsCached(admin)],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (e) {
      console.error(`[cache-warm] ${name} failed`, { code: (e as { code?: string } | null)?.code ?? null });
    }
  }
}
