"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentMailSecret, signAgentToken } from "@/lib/crm/agent-mail/token";

export interface IssueTokenResult {
  ok: boolean;
  error?: "denied" | "not_configured" | "audit_failed";
  token?: string;
}

/**
 * Issue an Agent Mail token for the SIGNED-IN user (Campaigns → Agent Mail). Only someone who may send
 * campaigns can mint one — and the MCP route re-checks that same grant on every call. The token is
 * returned once and never stored; issuing is audited (compliance: who handed an agent send access).
 */
export async function issueAgentTokenAction(): Promise<IssueTokenResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  const secret = agentMailSecret();
  if (!secret) return { ok: false, error: "not_configured" };

  let userId: string | null = null;
  let email: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId || !email) return { ok: false, error: "denied" };

  const issuedAt = Date.now();
  const { error } = await createAdminClient().from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: email,
    action: "agent_mail.token_issued",
    target_table: "agent_mail",
    summary: "Token Agent Mail (MCP) dibuat — berlaku 180 hari, mengikuti role CRM pemiliknya.",
    metadata: { issued_at: new Date(issuedAt).toISOString(), role },
  });
  if (error) return { ok: false, error: "audit_failed" };

  return { ok: true, token: signAgentToken({ userId, email, issuedAt }, secret) };
}
