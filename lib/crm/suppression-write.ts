import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IdentityKind } from "./suppression-input";

/**
 * Suppression WRITE layer — the only place the app writes suppression. Server-only; the
 * service-role admin client is passed in (the RPCs are `service_role`-only, so the anon
 * key cannot call them). This module does NOT normalize — it receives an already-canon
 * identity_key (D-2) — and it does NOT write audit rows: both RPCs write the suppression
 * row AND its audit row in ONE transaction (K-3). A second app-side audit write would
 * double-count and, worse, could land without its suppression row.
 *
 * The RPCs are the atomic unit. This wrapper only shapes arguments and surfaces the
 * jsonb result / error.
 */

export interface RecordArgs {
  identityKind: IdentityKind;
  identityKey: string; // already normalized by lib/crm/suppression-input
  reasonCode: string;
  reasonDetail: string | null;
  customerId: string | null;
  source: string | null;
  actorId: string | null;
  actorEmail: string | null;
}

export interface LiftArgs {
  identityKind: IdentityKind;
  identityKey: string;
  liftedReason: string;
  actorId: string | null;
  actorEmail: string | null;
}

export type SuppressionAction = "added" | "noop" | "lifted";

export interface SuppressionRpcResult {
  id: string;
  status: string;
  action: SuppressionAction;
  reactivated?: boolean;
  audit_id?: number;
}

/** Record (or reactivate) a suppression atomically with its audit row. */
export async function recordSuppression(
  admin: SupabaseClient,
  a: RecordArgs,
): Promise<SuppressionRpcResult> {
  const { data, error } = await admin.rpc("crm_record_suppression", {
    p_identity_kind: a.identityKind,
    p_identity_key: a.identityKey,
    p_reason_code: a.reasonCode,
    p_reason_detail: a.reasonDetail,
    p_customer_id: a.customerId,
    p_source: a.source,
    p_actor_id: a.actorId,
    p_actor_email: a.actorEmail,
  });
  if (error) throw error;
  return data as SuppressionRpcResult;
}

/** Lift (never delete, D-4) a suppression atomically with its audit row. */
export async function liftSuppression(
  admin: SupabaseClient,
  a: LiftArgs,
): Promise<SuppressionRpcResult> {
  const { data, error } = await admin.rpc("crm_lift_suppression", {
    p_identity_kind: a.identityKind,
    p_identity_key: a.identityKey,
    p_lifted_reason: a.liftedReason,
    p_actor_id: a.actorId,
    p_actor_email: a.actorEmail,
  });
  if (error) throw error;
  return data as SuppressionRpcResult;
}
