"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelScheduledSend } from "@/lib/crm/scheduled-send";
import { resumeRunDrain, stopRunDrain } from "@/lib/crm/send-drain";

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

/** The operator's email, for the drain_requested_by trace. Fail-open to null (the control still acts). */
async function actorEmail(): Promise<string | null> {
  try {
    return (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * "Lanjutkan" a PAUSED run (P0-3): re-arm the background drain so the pg_cron executor sends the next
 * day's budget. This is the human check the planDailySpread decision requires before a campaign
 * continues across days — one click, from the row, instead of rebuilding it in the composer. Gated by
 * send.* (same as composing); the server guard (resumeRunDrain) refuses anything but a paused run.
 */
export async function resumeDrainAction(runId: string): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  const res = await resumeRunDrain(createAdminClient(), runId, await actorEmail());
  if (res.ok) revalidatePath("/campaigns");
  return res;
}

/**
 * "Hentikan" a draining or paused run (P0-3): halt it and mark it stopped. Gated by send.*; the server
 * guard (stopRunDrain) refuses a terminal or workflow run. An in-flight batch finishes but the run is
 * not drained again (drain_active is cleared and never re-set by the drainer).
 */
export async function stopDrainAction(runId: string): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  const res = await stopRunDrain(createAdminClient(), runId);
  if (res.ok) revalidatePath("/campaigns");
  return res;
}
