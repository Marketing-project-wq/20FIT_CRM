import "server-only";
import { getCurrentUserRole } from "./current-role";
import {
  canAccess,
  canRequestExport,
  canSendMessages,
  type Level,
  type Resource,
  type Role,
} from "./roles";

/**
 * Server-side RBAC guards. FAIL-CLOSED: no role, unknown role, and an unscoped
 * unit_manager are all denied. Enforcement lives HERE (server), never in the UI —
 * hiding a menu is cosmetic.
 *
 * Ready infrastructure: there are no protected CRM server actions or route handlers
 * yet this sprint (the CRM screens are placeholders, ingestion is Sprint 3), so
 * these are not wired into a mutation path yet. Wrap each real server action /
 * route handler with the matching require* call as they are built.
 *
 * NOTE: unit-scope is not wired (scope table deferred), so scope-required roles are
 * denied by design until that table exists.
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Assert at least `min` on `resource`, else throw ForbiddenError. Returns the role. */
export async function requireAccess(
  resource: Resource,
  min: Exclude<Level, "none">,
): Promise<Role> {
  const role = await getCurrentUserRole();
  if (!canAccess(role, resource, min)) throw new ForbiddenError();
  return role as Role;
}

/** Non-throwing form for conditional rendering / branching. */
export async function hasAccess(
  resource: Resource,
  min: Exclude<Level, "none">,
): Promise<boolean> {
  return canAccess(await getCurrentUserRole(), resource, min);
}

export async function requireSendMessages(): Promise<Role> {
  const role = await getCurrentUserRole();
  if (!canSendMessages(role)) throw new ForbiddenError();
  return role as Role;
}

export async function requireExportRequest(): Promise<Role> {
  const role = await getCurrentUserRole();
  if (!canRequestExport(role)) throw new ForbiddenError();
  return role as Role;
}
