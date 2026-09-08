import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBodSnapshot, type BodSnapshot } from "./bod-snapshot";

/**
 * SERVER half of the board-summary data layer: the one read. Everything pure — the types, the
 * parse, the staleness rule — lives in `./bod-snapshot`, because the summary component renders
 * inside the client Dashboard and cannot import a `server-only` module (the production build fails,
 * not just a lint rule).
 *
 * Re-exported below so existing imports of `@/lib/crm/bod` keep working from server code.
 */
export * from "./bod-snapshot";

/** Read the one snapshot row. ONE query — the whole summary comes from it. */
export async function fetchBodSnapshot(admin: SupabaseClient): Promise<BodSnapshot> {
  const { data, error } = await admin
    .from("crm_mirror_meta")
    .select("dashboard_stats, refreshed_at")
    .maybeSingle();
  if (error) throw error;
  const row = data as { dashboard_stats: Record<string, unknown> | null; refreshed_at: string | null } | null;
  return parseBodSnapshot(row?.dashboard_stats ?? null, row?.refreshed_at ?? null);
}
