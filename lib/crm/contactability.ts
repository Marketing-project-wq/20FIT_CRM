/**
 * The "contactable" rule — the SINGLE definition, as a PURE function so it can be
 * unit-tested (Sprint 3E rule: a rule expressible as a pure function has a test). The DB
 * counting that feeds it at scale lives in the server read layer (contactability-read.ts);
 * this module has no I/O and is safe on client or server.
 *
 * PURPOSE-AWARE (Migrasi 11): the same rule serves BOTH "boleh dihubungi untuk marketing"
 * and "boleh dihubungi untuk layanan (transactional)" — one function that takes the purpose,
 * NOT two functions that copy the logic (K-09: one rule, one place). CS phones customers for
 * service; that is a different permission from marketing, but the SHAPE of the rule is
 * identical, so it must not be duplicated.
 *
 * Rule (PRD Fase 2):
 *   contactable(purpose) = has an ACTIVE consent row for THAT purpose, AND none of the
 *   profile's contact identities is in crm_suppression with status active.
 *
 * TWO invariants encoded here:
 *   1. SUPPRESSION WINS. It is checked FIRST and short-circuits — a suppressed identity
 *      is not contactable no matter what consent says, for ANY purpose. Enforced in CODE,
 *      not by a DB constraint, which is exactly why it must live in one tested function.
 *   2. FAIL-CLOSED. No active consent for the purpose -> not contactable. The ABSENCE of a
 *      consent row is a definite "no", never a "maybe" — consistent with RBAC.
 */

export interface ConsentRow {
  channel: string;
  purpose: string;
  status: string;
}

export type ContactPurpose = "marketing" | "transactional";

export type IdentityKind = "phone" | "email";
export interface Identity {
  kind: IdentityKind;
  key: string;
}

/** Canonical key for a suppression lookup set: `kind:normalized_value`. */
export function suppressionKey(kind: string, key: string): string {
  return `${kind}:${key}`;
}

/**
 * Is this profile contactable for `purpose`? Suppression wins (checked first), then
 * fail-closed on the absence of an active consent row for the purpose. This is the canonical
 * statement of the rule; the scalable read layer (contactability-read.ts) computes the SAME
 * thing as an inner-embed count + a suppression subtraction, verified against SQL
 * count(distinct) after the backfill.
 */
export function isContactableForPurpose(
  consents: readonly ConsentRow[],
  identities: readonly Identity[],
  activeSuppressionKeys: ReadonlySet<string>,
  purpose: ContactPurpose,
): boolean {
  // 1. Suppression wins — checked first, short-circuits everything else.
  for (const id of identities) {
    if (activeSuppressionKeys.has(suppressionKey(id.kind, id.key))) return false;
  }
  // 2. Fail-closed — need at least one active consent for THIS purpose.
  return consents.some((c) => c.purpose === purpose && c.status === "active");
}

/** Marketing is the most-used case; a thin wrapper so existing call sites and tests read
 *  naturally. Delegates to the purpose-aware rule — no copied logic. */
export function isContactableForMarketing(
  consents: readonly ConsentRow[],
  identities: readonly Identity[],
  activeSuppressionKeys: ReadonlySet<string>,
): boolean {
  return isContactableForPurpose(consents, identities, activeSuppressionKeys, "marketing");
}
