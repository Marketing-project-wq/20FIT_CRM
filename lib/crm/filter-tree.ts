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
import { getDictionary } from "../i18n";
import type { Lang } from "../i18n/config";

/** The segments dict slice, resolved once per call. lang defaults to "id" so existing callers
 *  (and the pure-function tests) get the original Indonesian output with no signature change. */
function words(lang: Lang) {
  return getDictionary(lang).segments;
}

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

function validateLeaf(leaf: LeafCondition, s: ReturnType<typeof words>): ValidateResult {
  switch (leaf.field) {
    case "hasPhone":
    case "hasEmail":
      return { ok: true };
    case "unit":
      return UNIT_VALUES.includes(leaf.value ?? "") ? { ok: true } : { ok: false, error: s.vUnknownUnit };
    case "segment":
      return SEGMENT_VALUES.includes(leaf.value ?? "") ? { ok: true } : { ok: false, error: s.vUnknownSegment };
    case "revenue":
      return REVENUE_VALUES.includes(leaf.value ?? "") ? { ok: true } : { ok: false, error: s.vUnknownRevenue };
    case "city": {
      const v = (leaf.value ?? "").trim();
      if (v === "") return { ok: false, error: s.vCityEmpty };
      if (v.length > CITY_MAX) return { ok: false, error: s.vCityTooLong };
      if (UNSAFE_VALUE.test(v)) return { ok: false, error: s.vCityUnsafe };
      return { ok: true };
    }
    default:
      return { ok: false, error: s.vUnknownField };
  }
}

function countConditions(node: FilterNode): number {
  return node.kind === "condition" ? 1 : node.children.reduce((n, c) => n + countConditions(c), 0);
}

/** Validate the whole tree. Root MUST be a group. Rejects: over-deep, over-count, empty
 *  groups, unknown/invalid leaves. Returns the first problem found. `lang` defaults to "id"
 *  so existing callers and tests are unchanged; the route passes the request language. */
export function validateFilterTree(node: FilterNode, depth = 1, lang: Lang = "id"): ValidateResult {
  const s = words(lang);
  if (node.kind !== "group") return { ok: false, error: s.vRootMustBeGroup };
  if (depth === 1 && countConditions(node) > MAX_CONDITIONS) {
    return { ok: false, error: `${s.vMaxConditionsA}${MAX_CONDITIONS}${s.vMaxConditionsB}` };
  }
  if (node.children.length === 0) return { ok: false, error: s.vEmptyGroup };
  for (const child of node.children) {
    if (child.kind === "group") {
      if (depth + 1 > MAX_DEPTH) return { ok: false, error: `${s.vMaxDepthA}${MAX_DEPTH}${s.vMaxDepthB}` };
      const r = validateFilterTree(child, depth + 1, lang);
      if (!r.ok) return r;
    } else {
      const r = validateLeaf(child, s);
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

function fieldPhrase(field: LeafField, v: string | null | undefined, s: ReturnType<typeof words>): string {
  switch (field) {
    case "unit": return `${s.rbUnit} ${v}`;
    case "segment": return v === SEGMENT_NULL ? s.rbNoSegment : `${s.rbSegment} ${v}`;
    case "city": return `${s.rbCityContainsA}${(v ?? "").trim()}${s.rbCityContainsB}`;
    case "revenue": return v === "has" ? s.rbHasRevenue : v === "negative" ? s.rbNegativeRevenue : s.rbNoRevenue;
    case "hasPhone": return s.rbHasPhone;
    case "hasEmail": return s.rbHasEmail;
  }
}

/** Render the tree as a sentence: "(has an email OR has a phone) AND unit arena". `lang` defaults
 *  to "id" so existing callers and pure-function tests get the original Indonesian output. */
export function describeFilterTree(node: FilterNode, top = true, lang: Lang = "id"): string {
  const s = words(lang);
  if (node.kind === "condition") return fieldPhrase(node.field, node.value, s);
  if (node.children.length === 0) return s.rbEveryone;
  const joiner = node.op === "AND" ? ` ${s.rbAnd} ` : ` ${s.rbOr} `;
  const parts = node.children.map((c) => describeFilterTree(c, false, lang));
  const joined = parts.join(joiner);
  return top || node.children.length === 1 ? joined : `(${joined})`;
}
