import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * City-fill % for the SegmentBuilder's "kota kosong" warning — a parameter-free aggregate, computed
 * live (never hardcoded, K-10). ONE implementation, imported by both mount points of the shared
 * builder (Campaigns and Exports), so the number can't drift between them.
 */
export async function loadCityFill(): Promise<{ total: number; cityFilled: number; cityFillPct: number }> {
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
