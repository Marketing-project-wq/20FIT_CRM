/**
 * SINGLE SOURCE OF TRUTH for the audit-log retention categories.
 *
 * Before Sprint 3E this list lived in THREE places, retyped each time: the SQL in
 * migration 8 (crm_purge_audit_log), classifyAction (the retention badge), and the
 * PostgREST `.or()` category filter in /api/audit. Three copies of a compliance rule
 * is exactly the silent-drift failure the phone canon was in Sprint 3B — and worse
 * here, because a mismatch makes the audit screen LABEL a row "kept permanently" while
 * the purge quietly deletes it. So everything TypeScript-side now derives from this
 * module: classifyAction and the `.or()` patterns are computed, never retyped.
 *
 * SQL cannot import TypeScript, so migration 8 stays a copy. That copy is not trusted
 * on faith — lib/crm/retention-policy.parity.test.ts reads the migration file, extracts
 * its action lists, and fails loudly if they diverge from the rules below. Migration 8
 * is applied and historical; the TypeScript side is what moves to match it.
 *
 * NOT server-only: pure data + pure functions, imported by both client and server.
 */

/** A matcher for one audit action: an exact action name, or a `prefix.` match. */
export type MatchRule = { kind: "exact"; value: string } | { kind: "prefix"; value: string };

/** Operational — purged after 90 days. MUST equal migration 8's allowlist. */
export const OPERATIONAL_RULES: readonly MatchRule[] = [
  { kind: "exact", value: "profile.viewed" },
  { kind: "exact", value: "list.viewed" },
  { kind: "prefix", value: "search." },
  { kind: "prefix", value: "login." },
];

/** Compliance — excluded from purge permanently. MUST equal migration 8's denylist. */
export const COMPLIANCE_RULES: readonly MatchRule[] = [
  { kind: "prefix", value: "consent." },
  { kind: "prefix", value: "suppression." },
  { kind: "prefix", value: "role." },
  { kind: "exact", value: "profile.deleted" },
  { kind: "prefix", value: "export." },
  { kind: "prefix", value: "retention." },
];

export function matchesRule(rule: MatchRule, action: string): boolean {
  return rule.kind === "exact" ? action === rule.value : action.startsWith(rule.value);
}

export function matchesAny(rules: readonly MatchRule[], action: string): boolean {
  return rules.some((r) => matchesRule(r, action));
}

export type RetentionClass = "operational" | "compliance" | "other";

/**
 * Classify an action for retention. `other` = not on the purge allowlist, so retained
 * by default (e.g. the Sprint 2B trigger-check artifact) — retained, but NOT a
 * deliberate compliance guarantee. Note compliance is checked to be disjoint from
 * operational by design; operational is tested first only for clarity.
 */
export function classifyAction(action: string): RetentionClass {
  if (matchesAny(OPERATIONAL_RULES, action)) return "operational";
  if (matchesAny(COMPLIANCE_RULES, action)) return "compliance";
  return "other";
}

/**
 * Derive a PostgREST `.or()` filter string from rules: exact -> `action.eq.NAME`,
 * prefix -> `action.like.PREFIX*` (`*` is the PostgREST like wildcard). This is what
 * /api/audit passes to `.or()`, so the category filter can never disagree with the
 * classifier — they come from the same rules.
 */
export function toPostgrestOr(rules: readonly MatchRule[]): string {
  return rules
    .map((r) => (r.kind === "exact" ? `action.eq.${r.value}` : `action.like.${r.value}*`))
    .join(",");
}

export const COMPLIANCE_OR = toPostgrestOr(COMPLIANCE_RULES);
export const OPERATIONAL_OR = toPostgrestOr(OPERATIONAL_RULES);

/** Canonical normalized form of a rule, for set comparison (e.g. against the SQL). */
export function normalizeRule(rule: MatchRule): string {
  return rule.kind === "exact" ? `exact:${rule.value}` : `prefix:${rule.value}`;
}

export function normalizeRules(rules: readonly MatchRule[]): string[] {
  return rules.map(normalizeRule).sort();
}

/** Count a set of audit rows by retention class — the ratio the audit screen shows. */
export function retentionRatio(actions: readonly string[]): {
  compliance: number;
  operational: number;
  other: number;
  total: number;
} {
  let compliance = 0;
  let operational = 0;
  let other = 0;
  for (const a of actions) {
    const c = classifyAction(a);
    if (c === "compliance") compliance++;
    else if (c === "operational") operational++;
    else other++;
  }
  return { compliance, operational, other, total: actions.length };
}
