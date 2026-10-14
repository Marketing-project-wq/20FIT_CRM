/**
 * In-memory stale-while-revalidate cache for EXPENSIVE AGGREGATES (owner request 2026-10-14: "load
 * nya bikin lebih cepat di semua page"). The CRM runs as one Node process on Railway, so a module-level
 * Map is shared by every request.
 *
 *  - fresh (age ≤ ttl): served from memory.
 *  - stale (ttl < age ≤ maxStale): served from memory AND refreshed in the background — the page
 *    never waits on the slow read (event analytics pages through all of master_customer, ~30 s).
 *  - older than maxStale, or never loaded: the caller waits for one load (concurrent callers share it).
 *  - a failed refresh keeps the last good value (and the next call retries).
 *
 * ONLY for aggregates that are identical for every viewer (counts, tallies, run lists). Role checks,
 * masking and per-person reads stay outside. Values are shared — callers must not mutate them.
 * Writes that change a cached aggregate call invalidateCache(prefix) so the next read is fresh.
 */

type Entry = { value?: unknown; at: number; inflight?: Promise<unknown> };
const store = new Map<string, Entry>();

function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  const entry: Entry = store.get(key) ?? { at: 0 };
  const p = load().then(
    (value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    },
    (err) => {
      const cur = store.get(key);
      if (cur) delete cur.inflight;
      throw err;
    },
  );
  entry.inflight = p;
  store.set(key, entry);
  p.catch(() => {}); // a background refresh failure must never become an unhandled rejection
  return p;
}

export async function cachedAggregate<T>(key: string, ttlMs: number, load: () => Promise<T>, maxStaleMs = ttlMs * 12): Promise<T> {
  const e = store.get(key);
  const age = e ? Date.now() - e.at : Infinity;
  if (e && "value" in e && e.value !== undefined && age <= maxStaleMs) {
    if (age > ttlMs && !e.inflight) void refresh(key, load).catch(() => {});
    return e.value as T;
  }
  if (e?.inflight) return e.inflight as Promise<T>;
  return refresh(key, load);
}

/** Drop every cached aggregate whose key starts with `prefix` (call after a write that changes it). */
export function invalidateCache(prefix: string): void {
  for (const k of Array.from(store.keys())) if (k.startsWith(prefix)) store.delete(k);
}

export const CACHE_KEYS = {
  deliveries: "deliveries",
  eventAnalytics: "event-analytics",
  tagVocab: "tag-vocab",
  cityFill: "city-fill",
  dashboard: (block: string) => `dashboard:${block}`,
  audience360: "audience-360",
} as const;
