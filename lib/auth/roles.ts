/**
 * RBAC — SINGLE SOURCE OF TRUTH for roles and the permission matrix.
 *
 * SOURCE: PRD Section 17.2 (official permission matrix). Adopted verbatim and
 * approved by Jeff on 2026-08-10. This replaces the earlier INFERRED matrix — the
 * numbers are no longer a guess, they are the PRD. Do not "tidy" or reinterpret a
 * cell: if it needs to change, that is a PRD change, not a code change.
 *
 * The matrix is action-based, and actions that the PRD splits per threshold
 * (export / send, ≤ threshold vs > threshold) are modeled as SEPARATE actions —
 * the grant genuinely differs across the boundary, so a single "export" verb would
 * lose information. The caller decides which side of the threshold it is on and asks
 * for the matching action.
 *
 * FOUR grants are NOT booleans (PRD note). They are distinct states and must never
 * be flattened to yes/no:
 *   - "masked"   — may see the list, but phone/email are DISGUISED. PRD 17.1
 *                  (`62812****8953`, `j***@domain.com`). Masking is done SERVER-SIDE;
 *                  the real value must never reach the browser.
 *   - "own_unit" — limited to the unit the user manages. The unit-scope table does
 *                  NOT exist yet, so a scope-required role has NO defined scope and
 *                  therefore NO access. Fail-closed. The fix is the scope table, not
 *                  loosening this.
 *   - "approval" — may REQUEST; needs approval. The approval flow is not built, so
 *                  for now this refuses with "needs approval, feature not available".
 *   - "draft" / "request" — may create a draft / file a request, may NOT execute.
 *
 * Enforcement is FAIL-CLOSED (grantFor / resolveGrant / isPermitted):
 *   - unknown or absent role -> every action DENIED
 *   - own_unit without a defined scope -> DENIED (needs_scope)
 *
 * Pure logic (no I/O) so it is safe on client or server. Role resolution and the
 * actual server guards live in current-role.ts and guard.ts.
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

/**
 * Actions — one per row of PRD 17.2, with export/send split per threshold. Renaming
 * or removing a member here is a PRD-level change; keep it in lockstep with the doc.
 */
export const ACTIONS = [
  "profile.view_list", // View profile list
  "profile.view_contact", // View contact details (phone/email in the clear)
  "profile.view_health", // View health flags
  "segment.build", // Build segment
  "export.at_or_below_threshold", // Export ≤ threshold
  "export.above_threshold", // Export > threshold
  "workflow.create", // Create workflow
  "workflow.activate", // Activate workflow
  "send.at_or_below_threshold", // Send ≤ threshold
  "send.above_threshold", // Send > threshold
  "consent.edit", // Edit consent
  "profile.merge", // Merge / unmerge
  "profile.delete", // Delete profile
  "audit.view", // View audit log
  "killswitch", // Kill switch
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * A single cell of the matrix. "allow"/"deny" are the booleans; the other four are
 * the non-boolean statuses described in the file header — keep them distinct.
 */
export type Grant =
  | "allow"
  | "deny"
  | "masked"
  | "own_unit"
  | "approval"
  | "draft"
  | "request";

// ── THE MATRIX (PRD 17.2, approved by Jeff 2026-08-10) ───────────────────────────
// Row order and cell values mirror the PRD table exactly. ✓ = allow, — = deny.
const MATRIX: Record<Role, Record<Action, Grant>> = {
  super_admin: {
    "profile.view_list": "allow",
    "profile.view_contact": "allow",
    "profile.view_health": "allow",
    "segment.build": "allow",
    "export.at_or_below_threshold": "allow",
    "export.above_threshold": "allow",
    "workflow.create": "allow",
    "workflow.activate": "allow",
    "send.at_or_below_threshold": "allow",
    "send.above_threshold": "allow",
    "consent.edit": "allow",
    "profile.merge": "allow",
    "profile.delete": "allow",
    "audit.view": "allow",
    killswitch: "allow",
  },
  crm_manager: {
    "profile.view_list": "allow",
    "profile.view_contact": "allow",
    "profile.view_health": "allow",
    "segment.build": "allow",
    "export.at_or_below_threshold": "allow",
    "export.above_threshold": "allow",
    "workflow.create": "allow",
    "workflow.activate": "allow",
    "send.at_or_below_threshold": "allow",
    "send.above_threshold": "allow",
    "consent.edit": "allow",
    "profile.merge": "deny",
    "profile.delete": "deny",
    "audit.view": "allow",
    killswitch: "allow",
  },
  crm_operator: {
    "profile.view_list": "allow",
    "profile.view_contact": "allow",
    "profile.view_health": "deny",
    "segment.build": "allow",
    "export.at_or_below_threshold": "approval",
    "export.above_threshold": "deny",
    "workflow.create": "draft",
    "workflow.activate": "deny",
    "send.at_or_below_threshold": "allow",
    "send.above_threshold": "deny",
    "consent.edit": "deny",
    "profile.merge": "deny",
    "profile.delete": "deny",
    "audit.view": "deny",
    killswitch: "deny",
  },
  unit_manager: {
    // "own unit" everywhere the PRD grants scoped access. scopeRequired -> until a
    // unit scope exists, resolveGrant turns every own_unit into needs_scope = DENY.
    "profile.view_list": "own_unit",
    "profile.view_contact": "own_unit",
    "profile.view_health": "deny",
    "segment.build": "own_unit",
    "export.at_or_below_threshold": "approval",
    "export.above_threshold": "deny",
    "workflow.create": "draft",
    "workflow.activate": "deny",
    "send.at_or_below_threshold": "own_unit",
    "send.above_threshold": "deny",
    "consent.edit": "deny",
    "profile.merge": "deny",
    "profile.delete": "deny",
    "audit.view": "deny",
    killswitch: "deny",
  },
  analyst: {
    "profile.view_list": "masked", // sees the list; phone/email masked server-side
    "profile.view_contact": "deny",
    "profile.view_health": "deny",
    "segment.build": "allow",
    "export.at_or_below_threshold": "deny",
    "export.above_threshold": "deny",
    "workflow.create": "deny",
    "workflow.activate": "deny",
    "send.at_or_below_threshold": "deny",
    "send.above_threshold": "deny",
    "consent.edit": "deny",
    "profile.merge": "deny",
    "profile.delete": "deny",
    "audit.view": "deny",
    killswitch: "deny",
  },
  data_steward: {
    "profile.view_list": "allow",
    "profile.view_contact": "allow",
    "profile.view_health": "deny",
    "segment.build": "deny",
    "export.at_or_below_threshold": "deny",
    "export.above_threshold": "deny",
    "workflow.create": "deny",
    "workflow.activate": "deny",
    "send.at_or_below_threshold": "deny",
    "send.above_threshold": "deny",
    "consent.edit": "allow",
    "profile.merge": "allow",
    "profile.delete": "request",
    "audit.view": "deny",
    killswitch: "deny",
  },
};

// ── CONTEXT ──────────────────────────────────────────────────────────────────────

export interface AccessContext {
  /**
   * Whether the current user has a defined unit scope. Only meaningful for
   * own_unit grants. Defaults to false -> deny, because the unit-scope table does
   * not exist yet. NEVER default this to true.
   */
  readonly hasUnitScope?: boolean;
}

// ── DECISIONS ────────────────────────────────────────────────────────────────────

/**
 * The resolved outcome of a (role, action, context) lookup. Unlike a raw Grant this
 * has already applied the context (scope), so own_unit collapses to either a real
 * "allow" (scoped) or "needs_scope" (unscoped -> denied).
 */
export type Decision =
  | "allow"
  | "masked"
  | "deny"
  | "needs_scope" // own_unit but no unit scope defined -> currently denied
  | "needs_approval" // approval flow not built -> currently refused
  | "draft_only" // may draft, not execute
  | "request_only"; // may request, not execute

/** Raw matrix lookup. Unknown/absent role -> deny (fail-closed). */
export function grantFor(role: unknown, action: Action): Grant {
  return isRole(role) ? MATRIX[role][action] : "deny";
}

/** Resolve a grant against the caller's context into a final Decision. Fail-closed. */
export function resolveGrant(
  role: unknown,
  action: Action,
  ctx: AccessContext = {},
): Decision {
  switch (grantFor(role, action)) {
    case "allow":
      return "allow";
    case "masked":
      return "masked";
    case "own_unit":
      return ctx.hasUnitScope === true ? "allow" : "needs_scope";
    case "approval":
      return "needs_approval";
    case "draft":
      return "draft_only";
    case "request":
      return "request_only";
    case "deny":
    default:
      return "deny";
  }
}

/**
 * May the role perform this action RIGHT NOW? "masked" counts as permitted — the
 * user genuinely receives the list; masking is a data-shaping concern applied at the
 * read layer, not a denial. Every deferred/conditional state (needs_scope,
 * needs_approval, draft_only, request_only, deny) is NOT permitted.
 */
export function isPermitted(role: unknown, action: Action, ctx: AccessContext = {}): boolean {
  const d = resolveGrant(role, action, ctx);
  return d === "allow" || d === "masked";
}

// ── DERIVED HELPERS (used by guards, the audience read layer, and nav) ───────────

/** May the role open the profile list (masked or not)? */
export function canViewProfileList(role: unknown, ctx: AccessContext = {}): boolean {
  return isPermitted(role, "profile.view_list", ctx);
}

/**
 * Must phone/email be masked for this role in the profile list? True unless the role
 * may view contact details IN FULL. Applied server-side in the audience read layer.
 * (analyst -> masked; crm_operator / data_steward / managers / super_admin -> clear;
 * an unscoped unit_manager cannot see the list at all, so this is moot for them.)
 */
export function shouldMaskContact(role: unknown, ctx: AccessContext = {}): boolean {
  return resolveGrant(role, "profile.view_contact", ctx) !== "allow";
}

/**
 * Nav visibility — COSMETIC ONLY (the server still enforces every action). Driven
 * from the same matrix so menu and enforcement never drift. Fail-closed: unknown
 * routes and roles are hidden. Some nav destinations have no dedicated PRD action
 * (they are screens, not matrix rows); those map to the closest governing action and
 * the mapping is documented inline so it stays honest.
 */
export function canSeeNav(role: unknown, href: string, ctx: AccessContext = {}): boolean {
  if (!isRole(role)) return false;
  switch (href) {
    case "/":
      return true; // dashboard: any valid role
    case "/audience":
      return canViewProfileList(role, ctx);
    case "/segments":
      return isPermitted(role, "segment.build", ctx);
    // Workflows / campaigns / templates are the workflow-authoring surface. Visible to
    // anyone who may create a workflow at all — including "draft" (they can compose,
    // just not activate). resolveGrant maps draft -> draft_only, so test the raw grant.
    case "/workflows":
    case "/campaigns":
    case "/templates":
      return grantFor(role, "workflow.create") !== "deny";
    case "/messages":
      return grantFor(role, "send.at_or_below_threshold") !== "deny";
    case "/consent":
      return grantFor(role, "consent.edit") !== "deny";
    case "/quality":
      // Data-quality dashboard: anyone who can see the profile list can see quality.
      return canViewProfileList(role, ctx);
    case "/exports":
      // Exports screen: visible to anyone who may export or REQUEST an export
      // (allow or approval), hidden where export is a flat deny.
      return grantFor(role, "export.at_or_below_threshold") !== "deny";
    case "/settings":
      // Settings holds the RBAC/audit surface -> gate on audit.view (super_admin,
      // crm_manager). Others have no business on it.
      return isPermitted(role, "audit.view", ctx);
    default:
      return false;
  }
}
