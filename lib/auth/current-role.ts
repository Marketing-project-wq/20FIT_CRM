import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRole, type Role } from "./roles";

/**
 * Resolve the signed-in user's CRM role. FAIL-CLOSED: any uncertainty resolves to
 * null = "no role" = denied by the guards. That includes: no session, no row for
 * the user, an unknown role value, a MISSING crm_user_role table (migration not
 * run), an unreachable database, or a missing service-role key.
 *
 * crm_user_role has RLS ON with ZERO policies, so the user's own anon client cannot
 * read it — the lookup MUST use the service-role admin client, server-side.
 *
 * NOT TESTABLE END-TO-END until the crm_user_role migration is run and a super_admin
 * is seeded. Until then this returns null for EVERYONE (correct, fail-closed). See
 * the deploy-ordering note in the code-phase report: this code must not reach
 * production before the table exists and a super_admin is seeded, or it locks
 * everyone out — which is the safe direction to fail, but must be sequenced.
 *
 * cache() dedupes the lookup within a single server request.
 */
export const getCurrentUserRole = cache(async (): Promise<Role | null> => {
  let userId: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    return null; // auth unreachable -> fail closed
  }
  if (!userId) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_user_role")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null; // missing table / no row / query error -> fail closed
    return isRole(data.role) ? data.role : null; // unknown stored value -> deny
  } catch {
    return null; // admin client unavailable (e.g. no service-role key) -> fail closed
  }
});
