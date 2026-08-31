import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SEND_LIMITS, validateSendLimits, type SendLimits } from "./send-limits";

/**
 * Send-config store (crm_send_config, singleton). The daily limit + workflow sub-cap were hard-coded;
 * they now live here so a Super Admin can change them (audited). Read is fail-safe: if the row is
 * missing or unreadable, fall back to the built-in defaults so a send is never blocked by a config
 * read. The cap-≤-limit rule is enforced both here (validateSendLimits) and in the DB (a check
 * constraint), so a bad value can never persist.
 */

export async function getSendConfig(admin: SupabaseClient): Promise<SendLimits> {
  try {
    const { data, error } = await admin
      .from("crm_send_config")
      .select("daily_limit, workflow_daily_cap")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_SEND_LIMITS };
    const row = data as { daily_limit: number; workflow_daily_cap: number };
    return { dailyLimit: row.daily_limit, workflowDailyCap: row.workflow_daily_cap };
  } catch {
    return { ...DEFAULT_SEND_LIMITS };
  }
}

/** Persist new limits (Super Admin only — the caller gates that). Validates before writing; the DB
 *  constraint is the backstop. Returns the previous limits so the caller can decide whether the
 *  raise was large enough to warrant the reputation warning in the audit note. */
export async function setSendConfig(
  admin: SupabaseClient,
  input: { dailyLimit: number; workflowDailyCap: number; updatedBy: string | null },
): Promise<{ ok: boolean; error?: string; previous?: SendLimits }> {
  const check = validateSendLimits(input);
  if (!check.ok) return { ok: false, error: check.error };

  const previous = await getSendConfig(admin);
  const { error } = await admin
    .from("crm_send_config")
    .update({ daily_limit: input.dailyLimit, workflow_daily_cap: input.workflowDailyCap, updated_by: input.updatedBy, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.code ?? "update_failed" };
  return { ok: true, previous };
}
