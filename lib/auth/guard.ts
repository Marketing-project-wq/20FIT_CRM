import "server-only";
import { getCurrentUserRole } from "./current-role";
import {
  isPermitted,
  resolveGrant,
  shouldMaskContact,
  type AccessContext,
  type Action,
  type Decision,
  type Role,
} from "./roles";

/**
 * Server-side RBAC guards. FAIL-CLOSED: no role, unknown role, and an unscoped
 * unit_manager (own_unit -> needs_scope) are all denied. Enforcement lives HERE
 * (server), never in the UI — hiding a menu is cosmetic.
 *
 * Ready infrastructure: most CRM mutation paths do not exist yet this sprint. The
 * one live consumer is the audience read layer (route handler), which calls
 * requireAction("profile.view_list") and contactMaskedForCurrentUser(). Wrap each new
 * server action / route handler with the matching require* call as they are built.
 *
 * NOTE: unit-scope is not wired (scope table deferred), so own_unit grants resolve to
 * needs_scope = denied by design until that table exists. Never pass hasUnitScope:true
 * to loosen this.
 */
export class ForbiddenError extends Error {
  /** The resolved decision that caused the denial, for a precise caller-facing message. */
  readonly decision: Decision;
  constructor(decision: Decision = "deny", message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
    this.decision = decision;
  }
}

/** Assert the current user may perform `action` now, else throw. Returns the role. */
export async function requireAction(action: Action, ctx: AccessContext = {}): Promise<Role> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, action, ctx)) {
    throw new ForbiddenError(resolveGrant(role, action, ctx));
  }
  return role as Role;
}

/** Non-throwing form for conditional rendering / branching. */
export async function hasAction(action: Action, ctx: AccessContext = {}): Promise<boolean> {
  return isPermitted(await getCurrentUserRole(), action, ctx);
}

/** Resolve the current user's decision for an action (allow, masked, needs_scope, deny, ...). */
export async function decisionForCurrentUser(
  action: Action,
  ctx: AccessContext = {},
): Promise<Decision> {
  return resolveGrant(await getCurrentUserRole(), action, ctx);
}

/** Should the current user see phone/email masked in the profile list? Fail-closed. */
export async function contactMaskedForCurrentUser(ctx: AccessContext = {}): Promise<boolean> {
  return shouldMaskContact(await getCurrentUserRole(), ctx);
}
