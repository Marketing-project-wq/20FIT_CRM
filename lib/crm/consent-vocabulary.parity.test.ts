import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CONSENT_BASES,
  CONSENT_PURPOSES,
  CONSENT_STATUSES,
  CONSENT_CHANNELS,
  purposePermittedForBasis,
  type ConsentBasis,
  type ConsentPurpose,
} from "./consent-policy";

/**
 * PARITAS kosakata crm_consent:  CHECK di database  ⇄  kanon TypeScript  ⇄  literal yang ditulis SQL.
 *
 * WHY THIS EXISTS (T-48). `consent-policy.ts` calls purposePermittedForBasis "the ONE gate a write
 * path must call before recording a consent row… fail-closed on unknown input". Migration 37 walks
 * straight past that gate: it writes its consent row in SQL, so no TypeScript runs, and it shipped
 * with `basis='opt_in'` — a value crm_consent_basis_check has never accepted. Nothing caught it,
 * because PL/pgSQL does not validate a function body's values at CREATE time: the function would
 * have been created successfully and failed only on the first real import, in production.
 *
 * The gate cannot be called from SQL. So this test is the substitute gate: it reads the SQL as text
 * and applies the same canon to it. Three layers, each catching a different failure:
 *
 *   (A) LIVE-RECORDED. The four CHECK definitions as read from pg_constraint on 2026-09-03, asserted
 *       equal to the TypeScript canon. Same honest limit as crm-norm-phone.parity.test: vitest runs
 *       OFFLINE, so a CHECK changed directly in the database is caught only when someone re-reads it.
 *       Re-verify these four arrays whenever either side moves.
 *   (B) STRUCTURAL. The vocabularies parsed out of the COMMITTED migration files — the repo's record
 *       of the schema. This layer is automatic: a future migration that alters a CHECK lands in
 *       supabase/migrations/, gets picked up here, and turns this test red unless the TypeScript
 *       canon follows it. That is the answer to "what if the CHECK changes and TS does not".
 *   (C) WRITE-PATH SCAN. Every `insert into crm_consent` in every migration is parsed positionally,
 *       and each literal it writes into basis/purpose/status/channel must be in the canon — plus each
 *       (basis, purpose) pair it writes must pass purposePermittedForBasis, the gate itself. This is
 *       the layer that would have caught 'opt_in' the day it was written.
 *
 * FAIL-CLOSED: if the parser cannot understand a CHECK or an insert it FAILS rather than skipping.
 * A vocabulary check that quietly passes on anything it cannot read is not a check.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** Strip `-- line comments` so commented-out SQL and prose can never be read as code. */
function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") inQuote = !inQuote;
        else if (!inQuote && line[i] === "-" && line[i + 1] === "-") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

const QUOTED = /'((?:[^']|'')*)'/g;
function quotedLiterals(fragment: string): string[] {
  return Array.from(fragment.matchAll(QUOTED)).map((m) => m[1].replace(/''/g, "'"));
}

// ── (A) LIVE-RECORDED ────────────────────────────────────────────────────────────────────────
//
// Read from pg_constraint on project cpvzwqptzcxnwzfzgrmt, 2026-09-03:
//   crm_consent_basis_check    CHECK ((basis   = ANY (ARRAY['legacy_import_unverified','explicit_opt_in'])))
//   crm_consent_purpose_check  CHECK ((purpose = ANY (ARRAY['marketing','transactional'])))
//   crm_consent_status_check   CHECK ((status  = ANY (ARRAY['active','withdrawn'])))
//   crm_consent_channel_check  CHECK ((channel = ANY (ARRAY['whatsapp','email','sms','phone_call'])))
const LIVE_2026_09_03: Record<string, string[]> = {
  basis: ["legacy_import_unverified", "explicit_opt_in"],
  purpose: ["marketing", "transactional"],
  status: ["active", "withdrawn"],
  channel: ["whatsapp", "email", "sms", "phone_call"],
};

const TS_CANON: Record<string, readonly string[]> = {
  basis: CONSENT_BASES,
  purpose: CONSENT_PURPOSES,
  status: CONSENT_STATUSES,
  channel: CONSENT_CHANNELS,
};

describe("(A) TypeScript canon == the CHECK constraints recorded live on 2026-09-03", () => {
  for (const col of Object.keys(LIVE_2026_09_03)) {
    it(`${col}: TS canon matches the live CHECK`, () => {
      expect([...TS_CANON[col]].sort()).toEqual([...LIVE_2026_09_03[col]].sort());
    });
  }
});

// ── (B) STRUCTURAL: the vocabularies as the migration files define them ──────────────────────
//
// Handles both spellings a migration may use:
//   check (basis in ('a','b'))
//   check (basis = any (array['a','b']))
function checkVocabularyFromMigrations(col: string): { values: string[]; source: string } {
  const constraintName = `crm_consent_${col}_check`;
  let found: { values: string[]; source: string } | null = null;

  for (const { name, sql } of migrationFiles()) {
    const code = stripLineComments(sql);
    let idx = code.toLowerCase().indexOf(constraintName);
    while (idx !== -1) {
      // Look ahead for the CHECK body that belongs to this constraint name.
      const window = code.slice(idx, idx + 400);
      const body = /check\s*\(([\s\S]*?)\)\s*\)?/i.exec(window);
      const isDefinition = /check\s*\(/i.test(window.slice(0, 120));
      if (isDefinition) {
        expect(body, `${name}: found ${constraintName} but could not read its CHECK body`).toBeTruthy();
        const values = quotedLiterals(window.slice(0, (body?.index ?? 0) + (body?.[0].length ?? 0)));
        expect(values.length, `${name}: ${constraintName} defined with no literal values`).toBeGreaterThan(0);
        found = { values, source: name };
      }
      idx = code.toLowerCase().indexOf(constraintName, idx + 1);
    }
  }

  expect(found, `no migration defines ${constraintName}`).toBeTruthy();
  return found as { values: string[]; source: string };
}

describe("(B) TypeScript canon == the CHECK the migration files define", () => {
  for (const col of Object.keys(TS_CANON)) {
    it(`${col}: the newest migration defining the CHECK agrees with the TS canon`, () => {
      const { values, source } = checkVocabularyFromMigrations(col);
      expect([...values].sort(), `defined in ${source}`).toEqual([...TS_CANON[col]].sort());
    });
  }
});

// ── (C) WRITE-PATH SCAN: every SQL insert into crm_consent ───────────────────────────────────

/** Split a SQL expression list on TOP-LEVEL commas (respecting quotes and parens). */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (inQuote) {
      cur += ch;
      if (ch === "'") inQuote = false;
      continue;
    }
    if (ch === "'") { inQuote = true; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

/** Find the top-level ` from ` that ends a SELECT list (ignores FROM inside parens/quotes). */
function topLevelFromIndex(text: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) { if (ch === "'") inQuote = false; continue; }
    if (ch === "'") { inQuote = true; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { if (depth === 0) return i; depth--; }
    else if (depth === 0 && /\s/.test(ch) && /^from\s/i.test(text.slice(i + 1))) return i;
  }
  return -1;
}

interface ConsentWrite {
  file: string;
  values: Record<string, string | null>; // column -> literal, or null when not a static literal
}

function consentWrites(): ConsentWrite[] {
  const writes: ConsentWrite[] = [];
  const INSERT = /insert\s+into\s+(?:public\.)?crm_consent\s*\(([^)]*)\)/gi;

  for (const { name, sql } of migrationFiles()) {
    const code = stripLineComments(sql);
    for (const m of Array.from(code.matchAll(INSERT))) {
      const columns = m[1].split(",").map((c) => c.trim().toLowerCase());
      const after = code.slice(m.index! + m[0].length);
      const selIdx = after.search(/\bselect\b/i);
      const valIdx = after.search(/\bvalues\s*\(/i);

      // FAIL-CLOSED: an insert whose value list this parser cannot locate must not pass silently.
      expect(
        selIdx !== -1 || valIdx !== -1,
        `${name}: insert into crm_consent has no SELECT or VALUES this test can read — extend the parser`,
      ).toBe(true);

      let listText: string;
      if (valIdx !== -1 && (selIdx === -1 || valIdx < selIdx)) {
        const open = after.indexOf("(", valIdx);
        const inner = after.slice(open + 1);
        const end = topLevelFromIndex(inner);
        listText = end === -1 ? inner : inner.slice(0, end);
      } else {
        const rest = after.slice(selIdx + "select".length);
        const end = topLevelFromIndex(rest);
        expect(end, `${name}: could not find the end of the SELECT list`).toBeGreaterThan(-1);
        listText = rest.slice(0, end);
      }

      const exprs = splitTopLevel(listText);
      expect(
        exprs.length,
        `${name}: ${columns.length} columns but ${exprs.length} expressions — parser and SQL disagree`,
      ).toBe(columns.length);

      const values: Record<string, string | null> = {};
      columns.forEach((col, i) => {
        const e = exprs[i];
        const lit = /^'((?:[^']|'')*)'$/.exec(e);
        values[col] = lit ? lit[1].replace(/''/g, "'") : null;
      });
      writes.push({ file: name, values });
    }
  }
  return writes;
}

describe("(C) every SQL write into crm_consent uses vocabulary the schema accepts", () => {
  const writes = consentWrites();

  it("finds the known SQL write paths (the scan is actually looking at something)", () => {
    // Migration 11 (crm_backfill_consent) and migration 37 (crm_ingest_csv_people).
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes.map((w) => w.file).join(" ")).toContain("crm_ingest_csv_people");
  });

  for (const col of Object.keys(TS_CANON)) {
    it(`${col}: every literal written by SQL is in the canon`, () => {
      for (const w of writes) {
        const v = w.values[col];
        if (v === null || v === undefined) continue; // column ref / expression / not written
        expect(
          (TS_CANON[col] as readonly string[]).includes(v),
          `${w.file} writes crm_consent.${col} = '${v}', which is NOT in the canon [${TS_CANON[col].join(", ")}]. ` +
            `crm_consent_${col}_check would reject it at runtime — the CREATE would still succeed.`,
        ).toBe(true);
      }
    });
  }

  it("every (basis, purpose) pair written by SQL passes the gate itself", () => {
    for (const w of writes) {
      const basis = w.values.basis;
      const purpose = w.values.purpose;
      if (!basis || !purpose) continue; // one of them is dynamic — nothing static to check
      expect(
        purposePermittedForBasis(basis as ConsentBasis, purpose as ConsentPurpose),
        `${w.file} writes basis='${basis}' with purpose='${purpose}', which purposePermittedForBasis refuses`,
      ).toBe(true);
    }
  });
});
