import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, type Role } from "./roles";

/**
 * The CRM role of a user by id — for callers WITHOUT a browser session (Agent Mail's MCP route, where
 * the signed agent token names the user). Same table + same fail-closed rules as getCurrentUserRole:
 * no row, an unknown/retired role, or any read error → null = denied.
 */
export async function roleForUserId(userId: string): Promise<Role | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("crm_user_role").select("role").eq("user_id", userId).maybeSingle();
    if (error || !data) return null;
    return effectiveRole((data as { role: unknown }).role);
  } catch {
    return null;
  }
}
