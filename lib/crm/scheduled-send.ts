import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { wibToUtcIso, WIB_OFFSET_HOURS } from "./wib-time";

export { wibToUtcIso, WIB_OFFSET_HOURS };

/**
 * Scheduled-send store. A scheduled send is a pending row that the pg_cron executor picks up once
 * scheduled_at <= now(). The actual send reuses sendCampaign (Node), so this module only
 * records/reads rows. WIB conversion lives in wib-time.ts (pure, client-safe).
 */

export interface ScheduledSend {
  id: string;
  segmentId: string;
  templateKey: string;
  runLabel: string | null;
  scheduledAt: string; // UTC ISO
  status: "pending" | "sent" | "failed" | "cancelled";
  createdAt: string;
  sentAt: string | null;
  lastError: string | null;
}

interface Row {
  id: string;
  segment_id: string;
  template_key: string;
  run_label: string | null;
  scheduled_at: string;
  status: ScheduledSend["status"];
  created_at: string;
  sent_at: string | null;
  last_error: string | null;
}

function toScheduled(r: Row): ScheduledSend {
  return {
    id: r.id,
    segmentId: r.segment_id,
    templateKey: r.template_key,
    runLabel: r.run_label,
    scheduledAt: r.scheduled_at,
    status: r.status,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    lastError: r.last_error,
  };
}

export async function insertScheduledSend(admin: SupabaseClient, input: {
  segmentId: string;
  templateKey: string;
  runLabel: string | null;
  scheduledAtUtc: string;
  confirmedLargeSend: boolean;
  shownSendable: number;
  createdBy: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await admin
    .from("crm_scheduled_send")
    .insert({
      segment_id: input.segmentId,
      template_key: input.templateKey,
      run_label: input.runLabel,
      scheduled_at: input.scheduledAtUtc,
      confirmed_large_send: input.confirmedLargeSend,
      shown_sendable: input.shownSendable,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code ?? "insert_failed" };
  return { ok: true, id: (data as { id: string }).id };
}

/** All non-final scheduled sends (pending), newest first, plus recently completed ones. */
export async function listScheduledSends(admin: SupabaseClient): Promise<ScheduledSend[]> {
  const { data, error } = await admin
    .from("crm_scheduled_send")
    .select("id, segment_id, template_key, run_label, scheduled_at, status, created_at, sent_at, last_error")
    .order("scheduled_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => toScheduled(r as Row));
}

/** Cancel a pending scheduled send. No-op if it already ran. */
export async function cancelScheduledSend(admin: SupabaseClient, id: string): Promise<{ ok: boolean }> {
  const { error } = await admin
    .from("crm_scheduled_send")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");
  return { ok: !error };
}

/** Claim due pending rows (scheduled_at <= now). Atomic per row via status guard — a claimed row
 *  flips to a transient marker so a second executor pass won't double-send. Returns claimed rows. */
export async function claimDueScheduledSends(admin: SupabaseClient, nowIso: string): Promise<ScheduledSend[]> {
  const { data: due } = await admin
    .from("crm_scheduled_send")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso);
  const ids = (due ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return [];

  const claimed: ScheduledSend[] = [];
  for (const id of ids) {
    // Guarded claim: only the executor that flips pending→(still pending, claimed_at set) proceeds.
    const { data, error } = await admin
      .from("crm_scheduled_send")
      .update({ claimed_at: nowIso })
      .eq("id", id)
      .eq("status", "pending")
      .is("claimed_at", null)
      .select("id, segment_id, template_key, run_label, scheduled_at, status, created_at, sent_at, last_error")
      .maybeSingle();
    if (!error && data) claimed.push(toScheduled(data as Row));
  }
  return claimed;
}

export async function markScheduledSent(admin: SupabaseClient, id: string): Promise<void> {
  await admin.from("crm_scheduled_send").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
}

export async function markScheduledFailed(admin: SupabaseClient, id: string, error: string): Promise<void> {
  await admin.from("crm_scheduled_send").update({ status: "failed", last_error: error.slice(0, 200) }).eq("id", id);
}
