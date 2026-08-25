/**
 * Role-administration SAFETY RULES — pure, testable, no I/O (FINAL TUGAS 4).
 *
 * The server action (app/(app)/settings/roles/actions.ts) does the gating + DB work; these functions
 * decide whether a specific add/change/revoke is ALLOWED given the current state. Kept pure so the
 * biting rules — you cannot demote yourself, and you cannot remove the last Super Admin — are unit
 * tested directly, not only exercised through Supabase.
 *
 * Callers MUST have already confirmed the actor is Super Admin (canManageRoles) and resolved the
 * target email to a real auth.users account. These functions assume both and only enforce the
 * state-dependent guards.
 */

import { isActiveRole, ACTIVE_ROLES, type Role } from "./roles";

/** Roles offered in the grant/change dropdown — the THREE active roles only (K-44), not all seven.
 *  Lives HERE (a plain module), not in the "use server" actions file — a "use server" module may only
 *  export async functions, so a const exported from it becomes an unusable stub on the client (T-32).
 *  The form imports this and the types below from here. */
export const GRANTABLE_ROLES = ACTIVE_ROLES;

export type RoleChangeError = "bad_role" | "self_demote" | "last_super_admin" | "not_assigned";

/** The full error surface a role action can return (gate + resolution + the state-dependent rules). */
export type RoleActionError = "denied" | "user_not_found" | "write_failed" | RoleChangeError;

export interface RoleActionResult {
  ok: boolean;
  error?: RoleActionError;
  email?: string;
  role?: Role;
  previousRole?: Role | null;
}

export interface RoleState {
  /** auth.users id of the Super Admin performing the action. */
  actorUserId: string;
  /** auth.users id of the account being changed. */
  targetUserId: string;
  /** Target's CURRENT crm_user_role role, or null if they have none yet. */
  targetCurrentRole: Role | null;
  /** How many super_admins currently exist in crm_user_role (target included if they are one). */
  superAdminCount: number;
}

/**
 * Decide an ADD or CHANGE (upsert). Returns null when allowed, else the blocking reason.
 *   - bad_role         — target role is not one of the known ROLES
 *   - self_demote      — a Super Admin may never strip their OWN super_admin (accountability / lockout)
 *   - last_super_admin — the last remaining Super Admin may not be demoted (system must keep one)
 * Re-granting yourself super_admin is a no-op and allowed; promoting anyone is always allowed.
 */
export function evaluateGrant(newRole: string, s: RoleState): RoleChangeError | null {
  if (!isActiveRole(newRole)) return "bad_role"; // only the three active roles may be granted (K-44)
  const isSelf = s.targetUserId === s.actorUserId;
  const demotes = newRole !== "super_admin";
  if (isSelf && demotes && s.targetCurrentRole === "super_admin") return "self_demote";
  if (s.targetCurrentRole === "super_admin" && demotes && s.superAdminCount <= 1) {
    return "last_super_admin";
  }
  return null;
}

/**
 * Decide a REVOKE (delete the crm_user_role row). Returns null when allowed, else the reason.
 *   - not_assigned     — target has no role to revoke
 *   - self_demote      — you cannot revoke your own role
 *   - last_super_admin — cannot revoke the last remaining Super Admin
 */
export function evaluateRevoke(s: RoleState): RoleChangeError | null {
  if (s.targetCurrentRole === null) return "not_assigned";
  if (s.targetUserId === s.actorUserId) return "self_demote";
  if (s.targetCurrentRole === "super_admin" && s.superAdminCount <= 1) return "last_super_admin";
  return null;
}
