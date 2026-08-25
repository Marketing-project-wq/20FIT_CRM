"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageRoles, isRole, ROLES, type Role } from "@/lib/auth/roles";
import { logApiFailure } from "@/lib/crm/failure-log";

/**
 * Role administration — SUPER-ADMIN EXCLUSIVE (K-43). This is the "prepare a way to grant roles"
 * from BAGIAN B. Every path here re-checks canManageRoles SERVER-SIDE (a hidden UI control is not a
 * gate), validates the target role against the closed ROLES list, upserts crm_user_role, and writes a
 * `role.granted` audit row — which the retention policy already keeps permanently (role.* compliance
 * family). Granting a role is granting every permission that role holds, so it is the highest-trust
 * write in the system and is denied to CRM Manager, Viewer, and everyone but Super Admin.
 */

export const GRANTABLE_ROLES = ROLES;

export interface GrantRoleResult {
  ok: boolean;
  error?: "denied" | "bad_role" | "user_not_found" | "write_failed";
  email?: string;
  role?: Role;
}

export async function grantRoleAction(input: { email: string; role: string }): Promise<GrantRoleResult> {
  const actorRole = await getCurrentUserRole();
  // THE gate. Fail-closed: only super_admin passes. CRM Manager / Viewer / everyone else → denied.
  if (!canManageRoles(actorRole)) return { ok: false, error: "denied" };

  if (!isRole(input.role)) return { ok: false, error: "bad_role" };
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "user_not_found" };

  let actorId = "unknown";
  let actorEmail: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    actorId = data.user?.id ?? "unknown";
    actorEmail = data.user?.email ?? null;
  } catch {
    // fail-closed identity; the audit actor is 'unknown' but the grant is still recorded
  }

  const admin = createAdminClient();

  // Resolve email → auth user id (the panel shows emails; crm_user_role is keyed on the uuid).
  let targetUserId: string | null = null;
  try {
    const { data: list } = await admin.auth.admin.listUsers();
    const match = (list?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
    targetUserId = match?.id ?? null;
  } catch {
    targetUserId = null;
  }
  if (!targetUserId) return { ok: false, error: "user_not_found" };

  try {
    const { error } = await admin
      .from("crm_user_role")
      .upsert({ user_id: targetUserId, role: input.role, granted_by: actorId }, { onConflict: "user_id" });
    if (error) {
      logApiFailure("/settings/roles", "role_grant_failed", { code: error.code });
      return { ok: false, error: "write_failed" };
    }
  } catch (e) {
    logApiFailure("/settings/roles", "role_grant_threw", { code: (e as { code?: string })?.code });
    return { ok: false, error: "write_failed" };
  }

  // Audit — role.* is permanently retained (compliance). PII-free: uuids + a role name, no contact.
  try {
    await admin.from("crm_audit_log").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action: "role.granted",
      target_table: "crm_user_role",
      summary: `Peran diberikan: ${input.role}.`,
      metadata: { target_user_id: targetUserId, new_role: input.role },
    });
  } catch (e) {
    logApiFailure("/settings/roles", "role_grant_audit_failed", { code: (e as { code?: string })?.code });
    // The grant succeeded; the audit is best-effort but its failure is logged (3K).
  }

  return { ok: true, email, role: input.role as Role };
}
