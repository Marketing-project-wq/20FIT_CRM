/**
 * RBAC — SINGLE SOURCE OF TRUTH for roles and the permission matrix.
 *
 * NEEDS PRD 17 CONFIRMATION. This matrix is INFERRED from the role names
 * (crm_user_role CHECK) and the real route inventory, then confirmed with four
 * corrections on 2026-08-10. It is deliberately ONE central object — never scatter
 * these rules into `if (role === ...)` across the codebase.
 *
 * Enforcement is FAIL-CLOSED (see getRolePermissions / canAccess):
 *   - unknown or absent role            -> DENY everything
 *   - unit_manager without a unit scope -> DENY everything (scope table not built yet, Q2)
 *   - export is NEVER a direct grant    -> the most any role gets is "request with approval"
 *
 * Pure logic (no I/O) so it is safe on client or server. Role resolution and the
 * actual guards live in current-role.ts and guard.ts.
 */

export const ROLES = [
  "super_admin",
  "crm_manager",
  "crm_operator",
  "unit_manager",
  "analyst",
  "data_steward",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Hierarchical access to a resource: manage > edit > view > none. */
export type Level = "none" | "view" | "edit" | "manage";
const LEVEL_RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, manage: 3 };

/** Resources governed by a hierarchical Level. */
export type Resource =
  | "audience"
  | "segments"
  | "campaigns"
  | "templates"
  | "workflows"
  | "consent"
  | "suppression"
  | "quality"
  | "roles";

/**
 * Export is deliberately NOT a Level. Even super_admin cannot hold a direct export
 * grant — the most a role gets is the right to REQUEST an export that then goes
 * through a logged approval path (Sprint 4+). Corrections #2/#3, 2026-08-10.
 */
export type ExportAccess = "none" | "request_approval";

export interface RolePermissions {
  readonly resources: Readonly<Record<Resource, Level>>;
  /** May press "send" on messages/workflows. */
  readonly messagesSend: boolean;
  /** Export is request-with-approval only, never a direct grant. */
  readonly exports: ExportAccess;
  /**
   * unit_manager is scope-gated. Until the unit-scope table exists (deferred, Q2),
   * a scope-required role has NO defined scope and therefore NO access. Modeled as a
   * flag so the guard fails CLOSED rather than defaulting permissive. Do not remove
   * this to "make unit_manager work" — the fix is the scope table, not open access.
   */
  readonly scopeRequired: boolean;
}

// ── THE MATRIX (single source of truth) ─────────────────────────────────────────
const MATRIX: Record<Role, RolePermissions> = {
  super_admin: {
    resources: {
      audience: "manage", segments: "manage", campaigns: "manage",
      templates: "manage", workflows: "manage", consent: "manage",
      suppression: "manage", quality: "manage", roles: "manage",
    },
    messagesSend: true,
    exports: "request_approval", // even super_admin: logged approval path, not a raw right
    scopeRequired: false,
  },
  crm_manager: {
    resources: {
      audience: "manage", segments: "manage", campaigns: "manage",
      templates: "manage", workflows: "manage", consent: "view",
      suppression: "view", quality: "manage", roles: "view",
    },
    messagesSend: true,
    exports: "request_approval", // correction #3
    scopeRequired: false,
  },
  crm_operator: {
    resources: {
      audience: "edit", segments: "edit", campaigns: "edit",
      templates: "view", workflows: "view", // sends, but does not compose templates
      consent: "view", suppression: "view", // correction #1: view (sender must see why blocked)
      quality: "view", roles: "none",
    },
    messagesSend: true,
    exports: "none",
    scopeRequired: false,
  },
  unit_manager: {
    // Levels below are what a SCOPED unit_manager would get. scopeRequired makes the
    // guard deny ALL of it until a unit scope is defined (none exists yet -> NO access).
    resources: {
      audience: "view", segments: "view", campaigns: "view",
      templates: "view", workflows: "view", consent: "none",
      suppression: "none", quality: "view", roles: "none",
    },
    messagesSend: false,
    exports: "none",
    scopeRequired: true,
  },
  analyst: {
    resources: {
      audience: "view", segments: "view", campaigns: "view",
      templates: "view", workflows: "view", consent: "view",
      suppression: "view", quality: "view", roles: "none",
    },
    messagesSend: false,
    exports: "request_approval", // correction #2: role most likely to export PII -> approval, not a right
    scopeRequired: false,
  },
  data_steward: {
    resources: {
      audience: "edit", // correction #4: cleans data, so edit, not just view
      segments: "view", campaigns: "none", templates: "none", workflows: "none",
      consent: "manage", suppression: "manage", quality: "manage", roles: "none",
    },
    messagesSend: false,
    exports: "none",
    scopeRequired: false,
  },
};

// ── FAIL-CLOSED ACCESSORS ────────────────────────────────────────────────────────

/** Returns permissions for a role, or null for any unknown/absent role. */
export function getRolePermissions(role: unknown): RolePermissions | null {
  return isRole(role) ? MATRIX[role] : null;
}

export interface AccessContext {
  /**
   * Whether the current user has a defined unit scope. Only meaningful for
   * scope-required roles (unit_manager). Defaults to false -> deny, because the
   * unit-scope table does not exist yet. NEVER default this to true.
   */
  readonly hasUnitScope?: boolean;
}

function scopeSatisfied(perms: RolePermissions, ctx: AccessContext): boolean {
  return !perms.scopeRequired || ctx.hasUnitScope === true;
}

/** Does `role` have at least `min` on `resource`? Fail-closed. */
export function canAccess(
  role: unknown,
  resource: Resource,
  min: Exclude<Level, "none">,
  ctx: AccessContext = {},
): boolean {
  const perms = getRolePermissions(role);
  if (!perms || !scopeSatisfied(perms, ctx)) return false;
  return LEVEL_RANK[perms.resources[resource]] >= LEVEL_RANK[min];
}

/** May this role send messages? Fail-closed. */
export function canSendMessages(role: unknown, ctx: AccessContext = {}): boolean {
  const perms = getRolePermissions(role);
  if (!perms || !scopeSatisfied(perms, ctx)) return false;
  return perms.messagesSend;
}

/** May this role REQUEST an export (which still needs approval)? Fail-closed. */
export function canRequestExport(role: unknown, ctx: AccessContext = {}): boolean {
  const perms = getRolePermissions(role);
  if (!perms || !scopeSatisfied(perms, ctx)) return false;
  return perms.exports === "request_approval";
}

/**
 * Nav visibility — COSMETIC ONLY (the server still enforces every action). Driven
 * from the same matrix so menu and enforcement never drift. "/" (dashboard) is
 * visible to any valid, in-scope role; unknown routes are hidden (fail-closed).
 */
export function canSeeNav(role: unknown, href: string, ctx: AccessContext = {}): boolean {
  const perms = getRolePermissions(role);
  if (!perms || !scopeSatisfied(perms, ctx)) return false;
  switch (href) {
    case "/": return true;
    case "/audience": return canAccess(role, "audience", "view", ctx);
    case "/segments": return canAccess(role, "segments", "view", ctx);
    case "/workflows": return canAccess(role, "workflows", "view", ctx);
    case "/campaigns": return canAccess(role, "campaigns", "view", ctx);
    case "/templates": return canAccess(role, "templates", "view", ctx);
    case "/messages": return canSendMessages(role, ctx);
    case "/consent": return canAccess(role, "consent", "view", ctx);
    case "/quality": return canAccess(role, "quality", "view", ctx);
    case "/exports": return canRequestExport(role, ctx);
    case "/settings": return canAccess(role, "roles", "view", ctx);
    default: return false;
  }
}
