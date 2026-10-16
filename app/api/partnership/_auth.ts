import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";

/** Session + role for partnership routes: view = workflow.create ≠ deny; admin = workflow.activate. */
export async function partnerActor() {
  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    email = null;
  }
  const role = email ? await getCurrentUserRole() : null;
  return { email, canView: !!email && grantFor(role, "workflow.create") !== "deny", canAdmin: !!email && isPermitted(role, "workflow.activate") };
}
