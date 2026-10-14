import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cachedAggregate, CACHE_KEYS } from "./server-cache";

/**
 * City-fill % for the SegmentBuilder's "kota kosong" warning — a parameter-free aggregate, computed
 * live (never hardcoded, K-10). ONE implementation, imported by both mount points of the shared
 * builder (Campaigns and Exports), so the number can't drift between them.
 */
export async function loadCityFill(): Promise<{ total: number; cityFilled: number; cityFillPct: number }> {
  // Two exact counts over ~92k rows on every Campaigns render — cached 10 min (a warning %, not a gate).
  return cachedAggregate(CACHE_KEYS.cityFill, 10 * 60_000, loadCityFillLive);
}

async function loadCityFillLive(): Promise<{ total: number; cityFilled: number; cityFillPct: number }> {
  try {
    const admin = createAdminClient();
    const [totalRes, cityRes] = await Promise.all([
      admin.from("master_customer").select("customer_id", { count: "exact", head: true }),
      admin.from("master_customer").select("customer_id", { count: "exact", head: true }).not("city", "is", null),
    ]);
    const total = totalRes.count ?? 0;
    const cityFilled = cityRes.count ?? 0;
    return { total, cityFilled, cityFillPct: total > 0 ? (cityFilled / total) * 100 : 0 };
  } catch {
    return { total: 0, cityFilled: 0, cityFillPct: 0 };
  }
}
