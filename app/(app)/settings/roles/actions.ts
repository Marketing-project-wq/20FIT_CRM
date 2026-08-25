"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageRoles, isActiveRole, isRole, type Role } from "@/lib/auth/roles";
import { evaluateGrant, evaluateRevoke, type RoleState, type RoleActionResult } from "@/lib/auth/role-admin";
import { findUserIdByEmail } from "@/lib/auth/user-directory";
import { logApiFailure } from "@/lib/crm/failure-log";

// NOTE: a "use server" module may ONLY export async functions. GRANTABLE_ROLES, RoleActionError, and
// RoleActionResult therefore live in lib/auth/role-admin.ts (a plain module) — the form imports them
// from there. Exporting a const/type from here would compile but break at runtime (it did: the
// dropdown's GRANTABLE_ROLES.map threw once the page was actually rendered).

/**
 * Role administration — SUPER-ADMIN EXCLUSIVE (K-43), the "20FIT Manager" tab (FINAL TUGAS 4).
 *
 * Add / change / revoke a CRM role. Every path here:
 *   - re-checks canManageRoles SERVER-SIDE (a hidden UI control is not a gate — LARANGAN);
 *   - resolves the email to an EXISTING auth.users account — it NEVER creates one (LARANGAN);
 *   - runs the biting safety rules (lib/auth/role-admin.ts): a Super Admin cannot demote or revoke
 *     THEMSELVES, and the LAST Super Admin cannot be demoted or revoked;
 *   - writes a `role.*` audit row (permanently retained, compliance family) recording the PREVIOUS
 *     role and the new one — so a change is legible, not just an end-state.
 *
 * Granting a role is granting every permission that role holds, so this is the highest-trust write in
 * the system; CRM Manager, Viewer, and everyone but Super Admin are denied.
 */

interface Actor {
  id: string;
  email: string | null;
}

/** Resolve the calling Super Admin's auth identity (fail-closed to 'unknown'). */
async function resolveActor(): Promise<Actor> {
  try {
    const { data } = await createClient().auth.getUser();
    return { id: data.user?.id ?? "unknown", email: data.user?.email ?? null };
  } catch {
    return { id: "unknown", email: null };
  }
}

/** Load the target's current role + the live count of super_admins, for the safety rules. */
async function loadRoleState(actorId: string, targetUserId: string): Promise<RoleState | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("crm_user_role").select("user_id, role");
    if (error) return null;
    const rows = (data ?? []) as { user_id: string; role: string }[];
    const target = rows.find((r) => r.user_id === targetUserId);
    return {
      actorUserId: actorId,
      targetUserId,
      targetCurrentRole: target && isRole(target.role) ? target.role : null,
      superAdminCount: rows.filter((r) => r.role === "super_admin").length,
    };
  } catch {
    return null;
  }
}

async function writeAudit(actor: Actor, action: "role.granted" | "role.revoked", targetUserId: string, meta: Record<string, unknown>, summary: string) {
  try {
    await createAdminClient().from("crm_audit_log").insert({
      actor_id: actor.id,
      actor_email: actor.email,
      action,
      target_table: "crm_user_role",
      summary,
      metadata: { target_user_id: targetUserId, ...meta },
    });
  } catch (e) {
    logApiFailure("/settings/roles", `${action}_audit_failed`, { code: (e as { code?: string })?.code });
    // The write succeeded; the audit is best-effort but its failure is itself logged (3K).
  }
}

/**
 * Add or CHANGE a role (upsert). Super-admin only, safety-guarded, audited with previous→new role.
 */
export async function grantRoleAction(input: { email: string; role: string }): Promise<RoleActionResult> {
  const actorRole = await getCurrentUserRole();
  if (!canManageRoles(actorRole)) return { ok: false, error: "denied" };
  // Only ACTIVE roles may be granted (K-44): a retired PRD role can't be handed out via crafted input,
  // even though it still exists in the matrix for parity. Defense-in-depth over the dropdown.
  if (!isActiveRole(input.role)) return { ok: false, error: "bad_role" };

  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "user_not_found" };

  const actor = await resolveActor();
  const targetUserId = await findUserIdByEmail(email);
  if (!targetUserId) return { ok: false, error: "user_not_found" };

  const state = await loadRoleState(actor.id, targetUserId);
  if (!state) return { ok: false, error: "write_failed" };

  const blocked = evaluateGrant(input.role, state);
  if (blocked) return { ok: false, error: blocked };

  try {
    const { error } = await createAdminClient()
      .from("crm_user_role")
      .upsert({ user_id: targetUserId, role: input.role, granted_by: actor.id }, { onConflict: "user_id" });
    if (error) {
      logApiFailure("/settings/roles", "role_grant_failed", { code: error.code });
      return { ok: false, error: "write_failed" };
    }
  } catch (e) {
    logApiFailure("/settings/roles", "role_grant_threw", { code: (e as { code?: string })?.code });
    return { ok: false, error: "write_failed" };
  }

  await writeAudit(
    actor,
    "role.granted",
    targetUserId,
    { previous_role: state.targetCurrentRole, new_role: input.role },
    state.targetCurrentRole
      ? `Peran diubah: ${state.targetCurrentRole} → ${input.role}.`
      : `Peran diberikan: ${input.role}.`,
  );

  return { ok: true, email, role: input.role as Role, previousRole: state.targetCurrentRole };
}

/**
 * REVOKE a role (delete the crm_user_role row). Super-admin only, safety-guarded, audited.
 */
export async function revokeRoleAction(input: { email: string }): Promise<RoleActionResult> {
  const actorRole = await getCurrentUserRole();
  if (!canManageRoles(actorRole)) return { ok: false, error: "denied" };

  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "user_not_found" };

  const actor = await resolveActor();
  const targetUserId = await findUserIdByEmail(email);
  if (!targetUserId) return { ok: false, error: "user_not_found" };

  const state = await loadRoleState(actor.id, targetUserId);
  if (!state) return { ok: false, error: "write_failed" };

  const blocked = evaluateRevoke(state);
  if (blocked) return { ok: false, error: blocked };

  try {
    const { error } = await createAdminClient()
      .from("crm_user_role")
      .delete()
      .eq("user_id", targetUserId);
    if (error) {
      logApiFailure("/settings/roles", "role_revoke_failed", { code: error.code });
      return { ok: false, error: "write_failed" };
    }
  } catch (e) {
    logApiFailure("/settings/roles", "role_revoke_threw", { code: (e as { code?: string })?.code });
    return { ok: false, error: "write_failed" };
  }

  await writeAudit(
    actor,
    "role.revoked",
    targetUserId,
    { previous_role: state.targetCurrentRole },
    `Peran dicabut: ${state.targetCurrentRole}.`,
  );

  return { ok: true, email, previousRole: state.targetCurrentRole };
}
