import { describe, it, expect, vi } from "vitest";

// export.ts / segment-read.ts / contactability-read.ts are all `import "server-only"`.
vi.mock("server-only", () => ({}));

import { streamSegmentCsv, type ExportContext } from "./export";
import { computeSegment } from "./segment-read";
import { filterTreeToExpr, type FilterNode } from "./filter-tree";
import { parseCriteria } from "./segment";
import { EXPORT_COLUMNS } from "./export-constants";
import { getDictionary } from "../i18n";

/**
 * TUGAS 2 — close the count-vs-row testing gap that let the 2026-08-20 export break ship.
 *
 * The bug: the COUNT path (computeSegment) selects ONLY `customer_id`; the ROW path
 * (streamSegmentCsv) selects EVERY EXPORT_COLUMNS column. EXPORT_COLUMNS listed `phone`, which
 * does not exist in master_customer (only `phone_normalized` does). So the count path counted
 * fine and the row path threw "column master_customer.phone does not exist" — AFTER the HTTP 200
 * and the header had already been sent, producing a truncated file with zero data rows. Only the
 * count path was ever tested, so the divergence was invisible.
 *
 * This test runs the REAL row-fetch path AND the REAL count path against ONE in-memory dataset,
 * for all four contact-coverage categories, and asserts the streamed row count equals the count
 * the count path reports. The fake DB validates every selected column against master_customer's
 * ACTUAL column set and throws "column does not exist" for any that is absent — exactly as
 * Postgres does. So if EXPORT_COLUMNS ever again names a column the row path cannot read, the row
 * path aborts, streams zero data rows, and this parity assertion FAILS.
 */

// master_customer's real physical columns (information_schema, project cpvzwqptzcxnwzfzgrmt,
// 2026-08-20). `phone` is deliberately ABSENT — that absence is what the row path must respect.
const MASTER_COLUMNS = new Set([
  "address", "city", "created_at", "customer_id", "date_of_birth", "duplicate_reason",
  "email", "email_normalized", "first_seen_at", "first_unit", "full_name", "gender",
  "is_merged", "is_potential_duplicate", "last_activity_at", "lifetime_value", "merged_into",
  "notes", "phone_normalized", "phone_raw", "segment", "source", "tags", "updated_at",
]);

interface Rec {
  customer_id: string;
  full_name: string | null;
  email: string | null;
  email_normalized: string | null;
  phone_normalized: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
}

// A dataset spanning all four coverage categories (both / email-only / phone-only / neither).
const DATASET: Rec[] = [
  rec("c1", "budi@x.id", "62811000001"),
  rec("c2", "sari@x.id", "62811000002"),
  rec("c3", "dewi@x.id", "62811000003"),
  rec("c4", "eko@x.id", null), // email only
  rec("c5", null, "62811000005"), // phone only
  rec("c6", null, null), // neither
];

function rec(id: string, email: string | null, phone: string | null): Rec {
  return {
    customer_id: id,
    full_name: `Nama ${id}`,
    email,
    email_normalized: email,
    phone_normalized: phone,
    city: "Jakarta",
    first_unit: "arena",
    segment: "loyal",
    lifetime_value: 1_000_000,
  };
}

// ── A tiny fake PostgREST client: validates columns, evaluates .or() logic strings ───────────

type Pred = (r: Record<string, unknown>) => boolean;

function evalExpr(expr: string): Pred {
  const m = /^(and|or)\((.*)\)$/.exec(expr);
  if (m) {
    const op = m[1];
    const parts = splitTop(m[2]).map(evalExpr);
    return (r) => (op === "and" ? parts.every((p) => p(r)) : parts.some((p) => p(r)));
  }
  // leaf: col.not.is.null | col.is.null | col.eq.v | col.gt.n | col.lt.n
  const t = expr.split(".");
  const col = t[0];
  if (t[1] === "not" && t[2] === "is" && t[3] === "null") return (r) => r[col] != null;
  if (t[1] === "is" && t[2] === "null") return (r) => r[col] == null;
  if (t[1] === "eq") return (r) => String(r[col]) === t.slice(2).join(".");
  if (t[1] === "gt") return (r) => Number(r[col]) > Number(t[2]);
  if (t[1] === "lt") return (r) => Number(r[col]) < Number(t[2]);
  throw new Error(`fake: unsupported leaf "${expr}"`);
}

/** Split on top-level commas (not inside parentheses). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function makeFake(inserts: Record<string, unknown>[]) {
  function builder(table: string) {
    const preds: Pred[] = [];
    let head = false;
    let selectCols: string[] = [];
    let colError: { code: string; message: string } | null = null;
    let orderCol: string | null = null;
    let rangeFrom = 0, rangeTo = Infinity;

    const settle = () => {
      const src = table === "master_customer" ? DATASET : ([] as Rec[]);
      let rows = (src as unknown as Record<string, unknown>[]).filter((r) => preds.every((p) => p(r)));
      if (orderCol) rows = [...rows].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
      const count = rows.length;
      if (head) return { data: null, count, error: null };
      const page = rows.slice(rangeFrom, rangeTo + 1).map((r) => {
        const o: Record<string, unknown> = {};
        for (const c of selectCols) o[c] = r[c];
        return o;
      });
      return { data: page, count, error: null };
    };

    const api = {
      select(cols: string, opts?: { count?: string; head?: boolean }) {
        head = opts?.head === true;
        // Validate each selected column against the real schema (embeds/aliases skipped).
        selectCols = cols.split(",").map((c) => c.trim()).filter((c) => c && !/[()!]/.test(c) && !c.includes("."));
        if (table === "master_customer") {
          for (const c of selectCols) {
            if (!MASTER_COLUMNS.has(c)) {
              colError = { code: "42703", message: `column ${table}.${c} does not exist` };
            }
          }
        }
        return api;
      },
      or(expr: string) { preds.push(evalExpr(expr)); return api; },
      eq(col: string, val: unknown) { if (!col.includes(".")) preds.push((r) => r[col] === val); return api; },
      is(col: string, val: unknown) { preds.push((r) => (val === null ? r[col] == null : r[col] === val)); return api; },
      not(col: string) { preds.push((r) => r[col] != null); return api; }, // only `.not(col,"is",null)` is used
      gt(col: string, n: number) { preds.push((r) => Number(r[col]) > n); return api; },
      lt(col: string, n: number) { preds.push((r) => Number(r[col]) < n); return api; },
      ilike(col: string, pat: string) { const term = pat.replace(/%/g, "").toLowerCase(); preds.push((r) => String(r[col] ?? "").toLowerCase().includes(term)); return api; },
      in(col: string, vals: unknown[]) { const set = new Set(vals); preds.push((r) => set.has(r[col])); return api; },
      order(col: string) { orderCol = col; return api; },
      range(from: number, to: number) { rangeFrom = from; rangeTo = to; return api; },
      insert(row: Record<string, unknown>) { inserts.push(row); return { then: (res: (v: unknown) => void) => res({ error: null }) }; },
      then(resolve: (v: unknown) => void) {
        resolve(colError ? { data: null, count: null, error: colError } : settle());
      },
    };
    return api;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => builder(t) } as any;
}

// ── Coverage categories as AND/OR trees (identical to the dashboard export buttons) ──────────

const CATEGORIES: { key: string; tree: FilterNode; predicate: (r: Rec) => boolean }[] = [
  {
    key: "both",
    tree: and("hasEmail", "hasPhone"),
    predicate: (r) => r.email_normalized != null && r.phone_normalized != null,
  },
  {
    key: "emailOnly",
    tree: and("hasEmail", "noPhone"),
    predicate: (r) => r.email_normalized != null && r.phone_normalized == null,
  },
  {
    key: "phoneOnly",
    tree: and("hasPhone", "noEmail"),
    predicate: (r) => r.phone_normalized != null && r.email_normalized == null,
  },
  {
    key: "neither",
    tree: and("noPhone", "noEmail"),
    predicate: (r) => r.phone_normalized == null && r.email_normalized == null,
  },
];

function and(a: string, b: string): FilterNode {
  return {
    kind: "group",
    op: "AND",
    children: [
      { kind: "condition", field: a as never },
      { kind: "condition", field: b as never },
    ],
  };
}

function ctxFor(): ExportContext {
  return {
    actorId: "00000000-0000-0000-0000-000000000000",
    actorEmail: "tester@20fit.id",
    criteriaSummary: "test",
    criteriaForAudit: {},
    nowIso: "2026-08-20T00:00:00.000Z",
    labels: getDictionary("id").export,
  };
}

async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
}

describe("export row path vs count path — parity for all coverage categories (TUGAS 2)", () => {
  for (const cat of CATEGORIES) {
    it(`category "${cat.key}": streamed rows == count path == ground truth, no abort`, async () => {
      const expr = filterTreeToExpr(cat.tree);
      const criteria = parseCriteria({});
      const groundTruth = DATASET.filter(cat.predicate).length;

      // Count path.
      const counted = await computeSegment(makeFake([]), criteria, expr);

      // Row path — the REAL streamer, against the same schema-validating fake.
      const inserts: Record<string, unknown>[] = [];
      const csv = await drain(streamSegmentCsv(makeFake(inserts), criteria, expr, ctxFor()));

      // Data rows = lines that are neither a comment (#...) nor the header nor blank.
      const lines = csv.split("\r\n").filter((l) => l.length > 0);
      const header = getDictionary("id").export.headers.customer_id; // "customer_id"
      const dataRows = lines.filter((l) => !l.startsWith("#") && !l.startsWith("﻿#") && !l.startsWith(header) && !l.startsWith("﻿" + header));

      // The file must NOT carry the mid-stream failure marker (the row path completed).
      expect(csv).not.toContain(getDictionary("id").export.aborted);
      // The three numbers agree — the divergence that shipped the bug cannot recur silently.
      expect(counted.matched).toBe(groundTruth);
      expect(dataRows.length).toBe(groundTruth);
      // EOF marker carries the same count, and exactly one audit row was written with it.
      expect(csv).toContain(`total_baris=${groundTruth}`);
      expect(inserts).toHaveLength(1);
      expect((inserts[0].metadata as { row_count: number }).row_count).toBe(groundTruth);
    });
  }

  it("EXPORT_COLUMNS names only real master_customer columns (the row path's source)", () => {
    for (const c of EXPORT_COLUMNS) {
      expect(MASTER_COLUMNS.has(c.column)).toBe(true);
    }
  });
});
