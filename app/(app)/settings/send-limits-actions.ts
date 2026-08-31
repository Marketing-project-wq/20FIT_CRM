"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canManageRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSendConfig, setSendConfig } from "@/lib/crm/send-config";
import { isLargeRaise, type SendLimits } from "@/lib/crm/send-limits";

/**
 * Send-limit settings actions. Editing is SUPER ADMIN ONLY (canManageRoles) and AUDITED — the daily
 * ceiling is a reputation control, so who changed it and to what must be recoverable. Read is open to
 * anyone who can reach the Settings page; the write action re-checks the role regardless of the UI.
 */

export async function getSendLimitsAction(): Promise<SendLimits> {
  return getSendConfig(createAdminClient());
}

export async function setSendLimitsAction(input: {
  dailyLimit: number;
  workflowDailyCap: number;
}): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (!canManageRoles(role)) return { ok: false, error: "denied" };

  let actorId = "unknown";
  let actorEmail: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    actorId = data.user?.id ?? "unknown";
    actorEmail = data.user?.email ?? null;
  } catch {
    // fail-closed identity; the write still audits with actor 'unknown'
  }

  const admin = createAdminClient();
  const res = await setSendConfig(admin, { dailyLimit: input.dailyLimit, workflowDailyCap: input.workflowDailyCap, updatedBy: actorEmail });
  if (!res.ok) return { ok: false, error: res.error };

  const prev = res.previous;
  const raisedLargely = prev ? isLargeRaise(prev.dailyLimit, input.dailyLimit) : false;
  try {
    await admin.from("crm_audit_log").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action: "send_config.updated",
      target_table: "crm_send_config",
      summary: `Batas kirim diubah: harian ${prev?.dailyLimit ?? "?"}→${input.dailyLimit}, workflow ${prev?.workflowDailyCap ?? "?"}→${input.workflowDailyCap}${raisedLargely ? " (kenaikan besar)" : ""}.`,
      metadata: {
        previous_daily_limit: prev?.dailyLimit ?? null,
        new_daily_limit: input.dailyLimit,
        previous_workflow_cap: prev?.workflowDailyCap ?? null,
        new_workflow_cap: input.workflowDailyCap,
        large_raise: raisedLargely,
      },
    });
  } catch {
    // best-effort audit; the config write already succeeded and is the source of truth.
  }

  revalidatePath("/settings");
  return { ok: true };
}
