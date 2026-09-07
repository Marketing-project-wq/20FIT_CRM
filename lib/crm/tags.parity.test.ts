import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TAG_NAMESPACES,
  OPERATOR_TAG_REGEX_SOURCE,
  SYSTEM_BARE_TAGS,
  isOperatorTag,
  isStoredTag,
  parseTagCell,
} from "./tags";

/**
 * PARITAS kosakata tag:  pola di TypeScript  ⇄  validasi di migrasi 37  ⇄  penjaga migrasi itu sendiri.
 *
 * Three separate things are locked here, because three separate things can silently break.
 *
 *  (A) THE PATTERN. lib/crm/tags.ts and the SQL function must apply the SAME rule. The wizard
 *      validates before dry-run; the function validates again at write. If they drift, one of them
 *      accepts what the other rejects and the operator gets a failure they were told would not
 *      happen. Compared character for character, not "both look like a regex".
 *
 *  (B) THE VOCABULARY the owner actually ships. A pattern that has never met the real values is how
 *      this started: the first proposal rejected 7 of 22 real tags. The 21-tag vocabulary of the
 *      final files is pinned here, so a future narrowing of the pattern fails loudly.
 *
 *  (C) THE MIGRATION'S OWN SHAPE. Migration 37 now carries THREE changes from three sources —
 *      #29's email-only dedup, #33's explicit_opt_in, and this branch's p_tags/tagged_existing. A
 *      conflict resolution can silently drop any one of them. The consent parity test catches a lost
 *      explicit_opt_in and the dedup parity test catches a lost email-only anti-join, but NOTHING
 *      guarded the third. These do.
 */

const MIGRATION = join(process.cwd(), "supabase", "migrations", "20260902050000_crm_ingest_csv_people.sql");
const sql = () => readFileSync(MIGRATION, "utf8");

// ── (A) pattern parity ────────────────────────────────────────────────────────────────────────
describe("(A) the SQL tag guard is the SAME regex as the TypeScript canon", () => {
  it("migration 37 contains OPERATOR_TAG_REGEX_SOURCE verbatim", () => {
    // The SQL writes it as a single-quoted literal in a `!~` test.
    expect(sql()).toContain(`'${OPERATOR_TAG_REGEX_SOURCE}'`);
  });

  it("the regex the SQL applies lists exactly the TS namespaces", () => {
    const m = /!~\s*'\^\(([^)]*)\)/.exec(sql());
    expect(m, "could not find the tag-shape regex in migration 37 — extend this test, do not delete it").toBeTruthy();
    expect((m as RegExpExecArray)[1].split("|").sort()).toEqual([...TAG_NAMESPACES].sort());
  });

  it("an invalid tag FAILS the call — it is never dropped or partially applied", () => {
    const body = sql();
    expect(body).toMatch(/raise exception 'crm_ingest_csv_people: % invalid tag/);
    expect(body).toContain("errcode = '22023'");
  });
});

// ── (B) the real vocabulary ───────────────────────────────────────────────────────────────────
// The 21 tags of the owner's final files (audiens-*.csv, 4 Sep 2026): 3,371 rows, 19,794
// attachments, zero pattern violations — measured, not assumed.
const SHIPPED_VOCABULARY = [
  "event:hyrox-sim-full", "event:hyrox-sim-half", "event:platarox-2026-07",
  "event:platarox-racelab", "event:sportfest-2-2026-02", "event:sportfest-3-2026-05",
  "format:double", "format:relay", "format:single",
  "kategori:laki-laki", "kategori:perempuan",
  "nilai:1jt-ke-atas", "nilai:300k-1jt", "nilai:di-bawah-300k",
  "peran:pendaftar", "produk:hybrid-race",
  "sumber:daftar-nama", "sumber:formulir-registrasi", "sumber:mayar",
  "tipe:berbayar", "tipe:gratis",
];

describe("(B) the canon accepts the vocabulary that actually ships", () => {
  it("all 21 shipped tags are valid operator tags", () => {
    expect(SHIPPED_VOCABULARY.length).toBe(21);
    for (const tag of SHIPPED_VOCABULARY) {
      expect(isOperatorTag(tag), `${tag} must be a legal operator tag`).toBe(true);
    }
  });

  it("the shapes that BROKE the first proposal stay rejected, and for the right reason", () => {
    // Un-namespaced (the owner renamed these to format:/kategori:).
    for (const tag of ["format-single", "format-double", "kategori-laki-laki"]) {
      expect(isOperatorTag(tag), tag).toBe(false);
    }
    // Comparison characters (renamed to nilai:di-bawah-300k / nilai:1jt-ke-atas) — these are the two
    // the first proposal did not anticipate, and they are why `<>=` never enters the vocabulary.
    for (const tag of ["nilai:<300k", "nilai:>=1jt"]) {
      expect(isOperatorTag(tag), tag).toBe(false);
    }
  });

  it("does NOT reject the 577 activity_ingest rows already live in master_customer", () => {
    // A canon that declared production invalid would be worse than no canon. `activity_ingest` and
    // `csv_import` carry an underscore and no namespace: they are an allowlist, never a pattern.
    for (const tag of SYSTEM_BARE_TAGS) {
      expect(isStoredTag(tag), `${tag} is live in production and must stay valid`).toBe(true);
      expect(isOperatorTag(tag), `${tag} must not be introducible from a CSV`).toBe(false);
    }
  });

  it("refuses system markers from operator input — a CSV must never inject batch:", () => {
    // `batch:` decides what a per-batch rollback DELETES. A CSV that could supply another batch's id
    // could get a real customer deleted by an unrelated rollback.
    for (const tag of ["batch:9f8e7d6c", "tagged:9f8e7d6c"]) {
      expect(isOperatorTag(tag), tag).toBe(false);
      expect(isStoredTag(tag), tag).toBe(true);
    }
    expect(parseTagCell("event:sportfest-3-2026-05|batch:abc").tags).toEqual(["event:sportfest-3-2026-05"]);
    expect(parseTagCell("event:sportfest-3-2026-05|batch:abc").invalid).toEqual(["batch:abc"]);
  });
});

// ── (C) the migration keeps all three of its changes ──────────────────────────────────────────
describe("(C) migration 37 still carries all three changes after any merge", () => {
  it("(1) #29's dedup is EMAIL-ONLY — no phone condition in the anti-join", () => {
    const body = sql();
    const m = /new_people as \(([\s\S]*?)\n  \),/.exec(body);
    expect(m, "could not find the new_people CTE").toBeTruthy();
    const cte = (m as RegExpExecArray)[1];
    expect(cte).toContain("m.email_normalized = v.ek");
    expect(cte, "a phone condition here would silently drop a distinct person for sharing a number (K-57)")
      .not.toContain("phone_normalized");
  });

  it("(2) #33's consent basis is a value the schema accepts", () => {
    expect(sql()).toContain("'explicit_opt_in'");
    expect(sql()).not.toMatch(/'marketing',\s*'opt_in'/);
  });

  it("(3) this branch's per-row tags and tagged_existing survive", () => {
    const body = sql();
    // Tags are PER ROW: p_rows carries `tags` on each row, p_tag_rows carries {email, tags}. A
    // batch-level array cannot express the real files — one event file already mixes format:single
    // with format:double and three nilai: bands.
    expect(body, "the signature must take p_tag_rows").toMatch(/p_tag_rows\s+jsonb/);
    expect(body, "each inserted row's own tags must be read").toContain("r->'tags'");
    expect(body, "the tagged_existing branch must exist").toContain("'tagged_existing'");
    expect(body, "existing people are marked tagged:, never batch:").toContain("'tagged:' || p_batch_id::text");
    expect(body).toContain("'shared_phone_in_batch'");
  });

  it("the grants follow the CURRENT signature — an overload must not keep old privileges", () => {
    const body = sql();
    expect(body).toContain("revoke all on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid, jsonb)");
    expect(body).toContain("grant execute on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid, jsonb) to service_role");
  });

  it("an EXISTING person's row is touched ONLY on tags", () => {
    const m = /upd as \(([\s\S]*?)returning m\.customer_id/.exec(sql());
    expect(m, "could not find the tagged-existing UPDATE").toBeTruthy();
    const stmt = (m as RegExpExecArray)[1];
    expect(stmt).toContain("set tags =");
    for (const col of ["source", "full_name", "phone_normalized", "city", "updated_at"]) {
      expect(stmt, `the UPDATE must not write ${col} — master stays authoritative`).not.toMatch(
        new RegExp(`\\b${col}\\s*=`),
      );
    }
    expect(stmt, "merged rows are skipped").toContain("merged_into is null");
  });
});
