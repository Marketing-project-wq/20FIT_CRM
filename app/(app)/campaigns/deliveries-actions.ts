"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelScheduledSend } from "@/lib/crm/scheduled-send";

/**
 * Cancel a pending scheduled send from the Deliveries tab. A scheduled send that can't be cancelled is
 * a trap, so this is reachable straight from the row. Gated by send.* (same as composing a send);
 * cancelScheduledSend is a no-op if the row already ran (status guard), so a race just returns not-ok.
 */
export async function cancelScheduledSendAction(id: string): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  const res = await cancelScheduledSend(createAdminClient(), id);
  if (res.ok) revalidatePath("/campaigns");
  return res;
}
