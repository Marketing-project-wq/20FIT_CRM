/**
 * AND/OR filter tree for the segment builder — PURE, client-safe (Sprint 3P, TUGAS 3).
 *
 * A group has an operator (AND/OR) and holds conditions or nested groups. Depth and count
 * are capped — NOT for performance, but because a filter a human cannot read produces a
 * segment nobody can be accountable for.
 *
 * SCOPE: leaves are master_customer fields (first_unit, segment, city, revenue, has-phone,
 * has-email). Ecosystem criteria (customer_engagement unit/product, Sprint 3N) are NOT part
 * of this tree: OR-ing an ecosystem presence against a master_customer column would need a
 * cross-table OR that PostgREST cannot express in one query. Rather than silently rewrite
 * such a form into something else (the worst failure on this screen), the ecosystem controls
 * stay a separate top-level AND, and the tree covers only same-table fields.
 *
 * The tree → PostgREST expression is a PURE function so every shape has a test: flat AND,
 * flat OR, OR inside AND, a single condition, and the rejected forms (empty group, too deep,
 * too many, unsafe value).
 */
import { SEGMENT_NULL } from "./audience-constants";

export type FilterOperator = "AND" | "OR";

/** Leaf fields — a closed list. Values are validated against the same closed lists the flat
 *  builder uses. hasPhone/hasEmail take no value. */
export type LeafField = "unit" | "segment" | "city" | "revenue" | "hasPhone" | "hasEmail";

export interface LeafCondition {
  kind: "condition";
  field: LeafField;
  value?: string | null;
}

export interface FilterGroup {
  kind: "group";
  op: FilterOperator;
  children: FilterNode[];
}

export type FilterNode = FilterGroup | LeafCondition;

export const MAX_DEPTH = 2; // root group (1) + at most one nested group level (2)
export const MAX_CONDITIONS = 12;

const UNIT_VALUES = ["20fit_data", "arena", "clinic", "gym", "shop"];
const SEGMENT_VALUES = ["new", "potential", "loyal", SEGMENT_NULL];
const REVENUE_VALUES = ["has", "none", "negative"]; // 'all' is "no constraint" -> not a leaf
const CITY_MAX = 60;
// PostgREST logic-string reserved characters — a value containing these can't be embedded
// safely, so such a condition is REJECTED, never silently stripped.
const UNSAFE_VALUE = /[,()".\\]/;

export type ValidateResult = { ok: true } | { ok: false; error: string };

function validateLeaf(leaf: LeafCondition): ValidateResult {
  switch (leaf.field) {
    case "hasPhone":
    case "hasEmail":
      return { ok: true };
    case "unit":
      return UNIT_VALUES.includes(leaf.value ?? "") ? { ok: true } : { ok: false, error: `unit tidak dikenal` };
    case "segment":
      return SEGMENT_VALUES.includes(leaf.value ?? "") ? { ok: true } : { ok: false, error: `segment tidak dikenal` };
    case "revenue":
      return REVENUE_VALUES.includes(leaf.value ?? "") ? { ok: true } : { ok: false, error: `revenue tidak dikenal` };
    case "city": {
      const v = (leaf.value ?? "").trim();
      if (v === "") return { ok: false, error: "kota kosong" };
      if (v.length > CITY_MAX) return { ok: false, error: "kota terlalu panjang" };
      if (UNSAFE_VALUE.test(v)) return { ok: false, error: "kota memuat karakter yang tak bisa diungkapkan aman" };
      return { ok: true };
    }
    default:
      return { ok: false, error: "field tidak dikenal" };
  }
}

function countConditions(node: FilterNode): number {
  return node.kind === "condition" ? 1 : node.children.reduce((n, c) => n + countConditions(c), 0);
}

/** Validate the whole tree. Root MUST be a group. Rejects: over-deep, over-count, empty
 *  groups, unknown/invalid leaves. Returns the first problem found. */
export function validateFilterTree(node: FilterNode, depth = 1): ValidateResult {
  if (node.kind !== "group") return { ok: false, error: "akar filter harus sebuah grup" };
  if (depth === 1 && countConditions(node) > MAX_CONDITIONS) {
    return { ok: false, error: `maksimum ${MAX_CONDITIONS} kondisi` };
  }
  if (node.children.length === 0) return { ok: false, error: "grup kosong tidak diperbolehkan" };
  for (const child of node.children) {
    if (child.kind === "group") {
      if (depth + 1 > MAX_DEPTH) return { ok: false, error: `kedalaman maksimum ${MAX_DEPTH} grup` };
      const r = validateFilterTree(child, depth + 1);
      if (!r.ok) return r;
    } else {
      const r = validateLeaf(child);
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}

/** Escape a value for a PostgREST ilike wildcard match inside a logic string. Wildcards in
 *  PostgREST logic strings are `*`, and `%`/`_` are literal. Unsafe chars are already
 *  rejected by validation, so this only wraps the term. */
function ilikeTerm(v: string): string {
  return `*${v.trim()}*`;
}

/** One leaf → a PostgREST condition expression. */
function leafToExpr(leaf: LeafCondition): string {
  switch (leaf.field) {
    case "unit":
      return `first_unit.eq.${leaf.value}`;
    case "segment":
      return leaf.value === SEGMENT_NULL ? `segment.is.null` : `segment.eq.${leaf.value}`;
    case "city":
      return `city.ilike.${ilikeTerm(leaf.value ?? "")}`;
    case "revenue":
      if (leaf.value === "has") return `lifetime_value.gt.0`;
      if (leaf.value === "negative") return `lifetime_value.lt.0`;
      // 'none' = null OR zero — itself a nested OR, expressed inline.
      return `or(lifetime_value.is.null,lifetime_value.eq.0)`;
    case "hasPhone":
      return `phone_normalized.not.is.null`;
    case "hasEmail":
      return `email_normalized.not.is.null`;
  }
}

/**
 * Tree → a single PostgREST logic expression, appliable via supabase-js `.or(expr)`:
 *   `.or("and(a,b)")` = (a AND b), `.or("or(a,b)")` = (a OR b), nesting composes.
 * Caller must validate() FIRST. Returns null for an empty root (whole pool, no constraint).
 */
export function filterTreeToExpr(node: FilterNode): string | null {
  if (node.kind === "condition") return leafToExpr(node);
  if (node.children.length === 0) return null;
  const inner = node.children.map(filterTreeToExpr).filter((s): s is string => s !== null);
  if (inner.length === 0) return null;
  const prefix = node.op === "AND" ? "and" : "or";
  return `${prefix}(${inner.join(",")})`;
}

// ── Readable sentence — shown ABOVE the result so a person reads what they built ──────────

const FIELD_PHRASES: Record<LeafField, (v?: string | null) => string> = {
  unit: (v) => `unit ${v}`,
  segment: (v) => (v === SEGMENT_NULL ? "tanpa segment" : `segment ${v}`),
  city: (v) => `kota memuat “${(v ?? "").trim()}”`,
  revenue: (v) => (v === "has" ? "punya revenue" : v === "negative" ? "revenue negatif" : "tanpa revenue"),
  hasPhone: () => "punya telepon",
  hasEmail: () => "punya email",
};

/** Render the tree as an Indonesian sentence: "(punya email ATAU punya telepon) DAN unit arena". */
export function describeFilterTree(node: FilterNode, top = true): string {
  if (node.kind === "condition") return FIELD_PHRASES[node.field](node.value);
  if (node.children.length === 0) return "semua orang";
  const joiner = node.op === "AND" ? " DAN " : " ATAU ";
  const parts = node.children.map((c) => describeFilterTree(c, false));
  const joined = parts.join(joiner);
  return top || node.children.length === 1 ? joined : `(${joined})`;
}
