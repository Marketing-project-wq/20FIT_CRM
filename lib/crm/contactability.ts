/**
 * The "contactable for marketing" rule — the SINGLE definition, as a PURE function so
 * it can be unit-tested (Sprint 3E rule: a rule expressible as a pure function has a
 * test). The DB counting that feeds it lives in the server read layer (dashboard.ts);
 * this module has no I/O and is safe on client or server.
 *
 * Rule (PRD Fase 2):
 *   contactable = has an ACTIVE marketing consent row, AND none of the profile's
 *   contact identities is in crm_suppression with status active.
 *
 * TWO invariants encoded here:
 *   1. SUPPRESSION WINS. It is checked FIRST and short-circuits — a suppressed identity
 *      is not contactable no matter what consent says. This is enforced in CODE, not by
 *      a DB constraint, which is exactly why it must live in one tested function.
 *   2. FAIL-CLOSED. No active marketing consent -> not contactable. The ABSENCE of a
 *      consent row is a definite "no", never a "maybe" — consistent with RBAC.
 */

export interface ConsentRow {
  channel: string;
  purpose: string;
  status: string;
}

export type IdentityKind = "phone" | "email";
export interface Identity {
  kind: IdentityKind;
  key: string;
}

/** Canonical key for a suppression lookup set: `kind:normalized_value`. */
export function suppressionKey(kind: string, key: string): string {
  return `${kind}:${key}`;
}

export function isContactableForMarketing(
  consents: readonly ConsentRow[],
  identities: readonly Identity[],
  activeSuppressionKeys: ReadonlySet<string>,
): boolean {
  // 1. Suppression wins — checked first, short-circuits everything else.
  for (const id of identities) {
    if (activeSuppressionKeys.has(suppressionKey(id.kind, id.key))) return false;
  }
  // 2. Fail-closed — need at least one active marketing consent.
  return consents.some((c) => c.purpose === "marketing" && c.status === "active");
}
