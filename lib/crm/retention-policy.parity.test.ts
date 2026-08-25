import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  OPERATIONAL_RULES,
  COMPLIANCE_RULES,
  normalizeRules,
  type MatchRule,
} from "./retention-policy";

/**
 * PARITY LOCK between the TypeScript retention policy and the SQL in migration 8.
 *
 * SQL can't import TypeScript, so `crm_purge_audit_log` carries its own copy of the
 * allowlist/denylist. This test reads that migration file, extracts its action lists,
 * and fails LOUDLY if they diverge from retention-policy.ts. Without it, a one-entry
 * drift would make the audit screen label a row "kept permanently" while the purge
 * deletes it — a silent compliance-evidence loss.
 *
 * Migration 8 is applied + historical; do NOT edit it to satisfy this test. The purge
 * function was later REPLACED by a new migration (…113518_crm_purge_audit_log_add_demographic_
 * compliance, Option 2 / K-09) that added `profile.demographic_updated` to the denylist — so this
 * test now reads THAT file (the current definition), and migration 8 stays untouched. If this
 * fails, the TypeScript side moves to match the live function (or a new migration + this file
 * move together again).
 */

const MIGRATION = fileURLToPath(
  new URL(
    // The CURRENT purge definition. …160306 is a create-or-replace that added the `campaign.%`
    // compliance family (K-39), APPLIED 2026-08-24 (dry-run verified campaign.sent excluded); the
    // parity target moves to it, exactly as it moved to …113518 when `profile.demographic_updated`
    // was added (K-09).
    "../../supabase/migrations/20260824160306_crm_purge_audit_log_add_campaign_compliance.sql",
    import.meta.url,
  ),
);

/** Extract normalized action rules from one SQL boolean block. */
function tokensFrom(block: string): string[] {
  const out = new Set<string>();
  for (const m of Array.from(block.matchAll(/action\s*=\s*'([^']+)'/g))) out.add(`exact:${m[1]}`);
  for (const m of Array.from(block.matchAll(/action\s+like\s+'([^']+)'/g))) {
    const pat = m[1];
    // Every like pattern in this policy is a `prefix.%`. If one ever isn't, fail here
    // rather than silently normalizing it wrong.
    if (!pat.endsWith("%")) throw new Error(`unexpected non-prefix like pattern: ${pat}`);
    out.add(`prefix:${pat.slice(0, -1)}`);
  }
  return Array.from(out).sort();
}

/** All `and ( … )` (allowlist) and `and not ( … )` (denylist) blocks in the file. */
function extractBlocks(sql: string): { allow: string[]; deny: string[] } {
  const allow = new Set<string>();
  const deny = new Set<string>();
  for (const m of Array.from(sql.matchAll(/\band\s+not\s*\(([\s\S]*?)\)/g)))
    tokensFrom(m[1]).forEach((t) => deny.add(t));
  for (const m of Array.from(sql.matchAll(/\band\s*\(([\s\S]*?)\)/g)))
    tokensFrom(m[1]).forEach((t) => allow.add(t));
  return { allow: Array.from(allow).sort(), deny: Array.from(deny).sort() };
}

describe("retention policy ⇄ migration 8 parity", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const { allow, deny } = extractBlocks(sql);

  it("actually extracted both lists from the migration (guards a broken regex)", () => {
    expect(allow.length).toBeGreaterThan(0);
    expect(deny.length).toBeGreaterThan(0);
  });

  it("migration allowlist == OPERATIONAL_RULES", () => {
    expect(allow, `SQL allowlist diverges from OPERATIONAL_RULES.\n  SQL: ${allow}\n  TS:  ${normalizeRules(OPERATIONAL_RULES)}`).toEqual(
      normalizeRules(OPERATIONAL_RULES),
    );
  });

  it("migration denylist == COMPLIANCE_RULES", () => {
    expect(deny, `SQL denylist diverges from COMPLIANCE_RULES.\n  SQL: ${deny}\n  TS:  ${normalizeRules(COMPLIANCE_RULES)}`).toEqual(
      normalizeRules(COMPLIANCE_RULES),
    );
  });

  it("operational and compliance rule sets are disjoint", () => {
    const op = new Set(normalizeRules(OPERATIONAL_RULES));
    const overlap = normalizeRules(COMPLIANCE_RULES).filter((r) => op.has(r));
    expect(overlap).toEqual([]);
  });

  it("every rule normalizes to exactly one form", () => {
    const all: readonly MatchRule[] = [...OPERATIONAL_RULES, ...COMPLIANCE_RULES];
    for (const r of all) expect(["exact", "prefix"]).toContain(r.kind);
  });
});
