/**
 * AI segment assistant — SHARED pure logic (Sprint 4A TUGAS 3). Client-safe: the segment builder
 * imports the proposal type + the describe helper; the server route imports the sanitizer. The
 * LLM call itself is server-only (lib/crm/segment-ai.ts).
 *
 * THE SECURITY MODEL is this file. The pipeline is:
 *   free text → (server) LLM → JSON → sanitizeAssistOutput → EXISTING validators → resolver
 * The LLM's JSON is NEVER trusted. sanitizeAssistOutput drops everything outside the closed
 * criteria vocabulary (unit/segment/revenue closed lists; eco/src via parseCriteria), enforces
 * the SAME profile.view_health gate as the manual builder (hasClinicalCriteria), and never lets
 * a time-based criterion through (there is no field for one — K-19). The LLM proposes; it cannot
 * widen what a role may express.
 */

import { AUDIENCE_UNITS, AUDIENCE_SEGMENTS, SEGMENT_NULL, capFilterValue, FILTER_VALUE_MAX } from "./audience-constants";
import type { LeafField } from "./filter-tree";
import { parseCriteria, hasClinicalCriteria, type SegmentCriteria } from "./segment";
import { programByKey } from "./staging-constants";

/** A master-column condition the assistant proposes (becomes an AND row in the tree builder). */
export interface AssistCondition {
  field: LeafField;
  /** "" for hasPhone/hasEmail (presence); otherwise the closed/free value. */
  value: string;
}

export interface AssistProposal {
  /** Master-column AND conditions (validated against the closed lists). */
  conditions: AssistCondition[];
  /** Ecosystem + source presence criteria (validated via parseCriteria). */
  criteria: SegmentCriteria;
  /** Things the request asked for that CANNOT be expressed — each with a plain reason. */
  unexpressible: string[];
  /** True when a clinical criterion was requested but the role lacks profile.view_health — it
   *  was STRIPPED, not returned. The UI says so. */
  clinicalBlocked: boolean;
  /** The model's short note / stated uncertainty (capped). Empty when none. */
  notes: string;
}

const MAX_CONDITIONS = 12; // matches the filter tree's cap
const MAX_UNEXPRESSIBLE = 8;
const MAX_NOTE = 240;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Validate one proposed master condition against the closed lists. null = drop it. */
function sanitizeCondition(raw: unknown): AssistCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const field = o.field;
  switch (field) {
    case "unit": {
      const v = str(o.value);
      return v && (AUDIENCE_UNITS as readonly string[]).includes(v) ? { field, value: v } : null;
    }
    case "segment": {
      const v = str(o.value);
      if (v && ((AUDIENCE_SEGMENTS as readonly string[]).includes(v) || v === SEGMENT_NULL)) return { field, value: v };
      return null;
    }
    case "revenue": {
      const v = str(o.value);
      // "all" is a no-op (whole pool), so it is not a condition.
      return v && (v === "has" || v === "none" || v === "negative") ? { field, value: v } : null;
    }
    case "city": {
      const v = str(o.value);
      if (!v) return null;
      const capped = capFilterValue(v, FILTER_VALUE_MAX).value;
      return capped ? { field, value: capped } : null;
    }
    case "hasPhone":
    case "hasEmail":
      // Presence flags: only meaningful when true; value carries nothing.
      return o.value === false ? null : { field, value: "" };
    default:
      return null; // unknown field (incl. any time-based key) → dropped, never guessed
  }
}

/**
 * Turn untrusted LLM JSON into a safe PROPOSAL. Pure. Everything outside the closed vocabulary is
 * dropped; the clinical gate is enforced; nothing here computes or reads the database.
 */
export function sanitizeAssistOutput(raw: unknown, opts: { canViewHealth: boolean }): AssistProposal {
  const o = (raw ?? {}) as Record<string, unknown>;

  const conditionsRaw = Array.isArray(o.conditions) ? o.conditions : [];
  const conditions: AssistCondition[] = [];
  const seen = new Set<string>();
  for (const c of conditionsRaw) {
    const sc = sanitizeCondition(c);
    if (!sc) continue;
    // De-dupe identical field+value; cap total.
    const key = `${sc.field}:${sc.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conditions.push(sc);
    if (conditions.length >= MAX_CONDITIONS) break;
  }

  // Ecosystem + source presence: build ONLY those keys and run through the existing validator,
  // which enforces the closed lists (eco unit/product, RFM value, program key). Master flat fields
  // are intentionally omitted — those live in `conditions` (the tree), never doubled here.
  let criteria = parseCriteria({
    ecoUnit: o.ecoUnit,
    ecoProduct: o.ecoProduct,
    srcHyrox: o.srcHyrox,
    srcMy20fit: o.srcMy20fit,
    srcRecency: o.srcRecency,
    srcArena: o.srcArena,
    srcGym: o.srcGym,
    srcClinicPatient: o.srcClinicPatient,
    srcClinicTxn: o.srcClinicTxn,
    srcRfm: o.srcRfm,
    srcProgram: o.srcProgram,
  });

  // Clinical gate — identical rule to the manual builder + the route. If the role can't view
  // health, STRIP the clinical criteria (never return them) and flag it.
  let clinicalBlocked = false;
  if (hasClinicalCriteria(criteria) && !opts.canViewHealth) {
    clinicalBlocked = true;
    const programIsClinical = criteria.srcProgram ? programByKey(criteria.srcProgram)?.clinical === true : false;
    criteria = {
      ...criteria,
      srcClinicPatient: false,
      srcClinicTxn: false,
      srcProgram: programIsClinical ? null : criteria.srcProgram,
    };
  }

  const unexpressible: string[] = [];
  if (Array.isArray(o.unexpressible)) {
    for (const u of o.unexpressible) {
      const s = str(u);
      if (s) unexpressible.push(s.slice(0, MAX_NOTE));
      if (unexpressible.length >= MAX_UNEXPRESSIBLE) break;
    }
  }

  const notes = (str(o.notes) ?? "").slice(0, MAX_NOTE);

  return { conditions, criteria, unexpressible, clinicalBlocked, notes };
}

// ── Readable description (so the user reads the proposal before running it) ──────────────────

const FIELD_WORD: Record<LeafField, string> = {
  unit: "unit", segment: "segment", city: "kota", revenue: "revenue",
  hasPhone: "punya telepon", hasEmail: "punya email",
};

function conditionPhrase(c: AssistCondition): string {
  if (c.field === "hasPhone" || c.field === "hasEmail") return FIELD_WORD[c.field];
  if (c.field === "segment" && c.value === SEGMENT_NULL) return "tanpa segment";
  return `${FIELD_WORD[c.field]} = ${c.value}`;
}

/** A plain-language sentence for the proposal. Empty proposal → "whole pool". */
export function describeProposal(p: AssistProposal): string {
  const parts: string[] = [];
  for (const c of p.conditions) parts.push(conditionPhrase(c));
  const cr = p.criteria;
  if (cr.ecoUnit) parts.push(`ekosistem unit ${cr.ecoUnit}`);
  if (cr.ecoProduct) parts.push(`ekosistem produk ${cr.ecoProduct}`);
  if (cr.srcHyrox) parts.push("peserta Hyrox");
  if (cr.srcMy20fit) parts.push("pengguna my20fit");
  if (cr.srcRecency) parts.push("punya aktivitas nyata");
  if (cr.srcArena) parts.push("ada di arena");
  if (cr.srcGym) parts.push("ada di gym");
  if (cr.srcClinicPatient) parts.push("pasien klinik");
  if (cr.srcClinicTxn) parts.push("punya transaksi klinik");
  if (cr.srcRfm) parts.push(`RFM ${cr.srcRfm}`);
  if (cr.srcProgram) parts.push(`ikut program ${programByKey(cr.srcProgram)?.label ?? cr.srcProgram}`);
  return parts.length > 0 ? parts.join(" DAN ") : "seluruh pool (tidak ada kriteria terbaca)";
}

/** Whether the proposal actually narrows anything (else the model failed to map the request). */
export function proposalIsEmpty(p: AssistProposal): boolean {
  return p.conditions.length === 0 && hasNoSourceCriteria(p.criteria);
}

function hasNoSourceCriteria(c: SegmentCriteria): boolean {
  return (
    !c.ecoUnit && !c.ecoProduct && !c.srcHyrox && !c.srcMy20fit && !c.srcRecency &&
    !c.srcArena && !c.srcGym && !c.srcClinicPatient && !c.srcClinicTxn && !c.srcRfm && !c.srcProgram
  );
}
