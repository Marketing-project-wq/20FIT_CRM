import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countContactableForPurpose,
  fetchSuppressedCustomerIds,
  type ApplyMaster,
} from "./contactability-read";
import { SEGMENT_NULL, type SegmentCriteria } from "./segment";
import { resolveEcosystemCustomerIds } from "./engagement";
import { resolveEnrichmentCustomerIds } from "./enrichment";
import { resolveMultiSourceCustomerIds } from "./multisource";
import { resolveClinicPatientCustomerIds, resolveClinicTxnCustomerIds } from "./clinic-source";
import { resolveStagingRfmCustomerIds, resolveStagingProgramCustomerIds } from "./staging";
import type { EcosystemUnit } from "./engagement-constants";

/** Intersect a list of id sets (AND). Iterates the smallest for speed. Empty input → null. */
function intersectSets(sets: Set<string>[]): Set<string> | null {
  if (sets.length === 0) return null;
  const sorted = [...sets].sort((a, b) => a.size - b.size);
  const [smallest, ...rest] = sorted;
  const out = new Set<string>();
  for (const id of Array.from(smallest)) {
    if (rest.every((s) => s.has(id))) out.add(id);
  }
  return out;
}

/**
 * Segment computation — READ-ONLY over master_customer + crm_consent + crm_suppression.
 * Returns ONLY counts: how many match, and how many of those are contactable — for MARKETING
 * and for SERVICE separately (Migrasi 11). It never returns rows — a segment builder that
 * emits a list of people is an export without a name (Sprint 3M). If someone wants to see the
 * people, that's /audience's job (masked, audited). Server-only; the service-role client is
 * passed in by the route.
 *
 * `contactable*` is DERIVED from the shared rule (countContactableForPurpose over an inner
 * embed of crm_consent, K-03), never a second rule. It is a head:true count — no rows are
 * pulled, so the 408k-row backfill can't silently truncate it (the old code SELECTed every
 * active consent row and .in()-ed 80k ids — that breaks at PostgREST's max-rows cap).
 */

export interface SegmentCounts {
  matched: number;
  contactableMarketing: number;
  contactableService: number;
}

/** Apply the criteria filters to a master_customer query. Shared by the matched-count and the
 *  contactable inner-embed query so they can never diverge. The builder types are awkward to
 *  type generically, so `any` mirrors the existing read layers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCriteria(q: any, c: SegmentCriteria, masterFilterExpr?: string | null): any {
  let out = q;
  // AND/OR tree (Sprint 3P): when a validated master filter expression is supplied it
  // REPLACES the flat master fields entirely, applied as one PostgREST logic string. The
  // flat fields are only used when there is no tree (backward compatible).
  if (masterFilterExpr) {
    out = out.or(masterFilterExpr);
  } else {
    if (c.unit) out = out.eq("first_unit", c.unit);
    if (c.segment === SEGMENT_NULL) out = out.is("segment", null);
    else if (c.segment) out = out.eq("segment", c.segment);
    if (c.city && c.city.trim() !== "") {
      // Escape PostgREST like wildcards so a city value can't inject a pattern.
      const esc = c.city.replace(/[%_\\]/g, (m) => `\\${m}`);
      out = out.ilike("city", `%${esc}%`);
    }
    if (c.revenue === "has") out = out.gt("lifetime_value", 0);
    else if (c.revenue === "none") out = out.or("lifetime_value.is.null,lifetime_value.eq.0");
    else if (c.revenue === "negative") out = out.lt("lifetime_value", 0);
    if (c.hasPhone) out = out.not("phone_normalized", "is", null);
    if (c.hasEmail) out = out.not("email_normalized", "is", null);
  }
  // NOTE: ecosystem criteria (ecoUnit/ecoProduct) are NOT applied here — they live in
  // customer_engagement, a different table. They are resolved to a customer_id set and
  // intersected separately (see computeSegment). applyCriteria only touches master_customer.
  return out;
}

/** Whether any MASTER (master_customer) criterion narrows the pool — ecosystem criteria
 *  excluded, since those are resolved against a different table. A validated tree expression
 *  also counts as narrowing. */
function hasMasterCriteria(c: SegmentCriteria, masterFilterExpr?: string | null): boolean {
  if (masterFilterExpr) return true;
  return Boolean(
    c.unit ||
      c.segment ||
      (c.city && c.city.trim() !== "") ||
      c.revenue !== "all" ||
      c.hasPhone ||
      c.hasEmail,
  );
}

const IN_CHUNK = 500; // uuids per .in() batch — bounded URL length

/** Count master_customer rows that BOTH match the master criteria AND have a customer_id
 *  in `ids`. Chunks `ids` into .in() batches (head:true counts, no rows read) and sums. */
async function countMasterWithinIds(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
  ids: string[],
  masterFilterExpr?: string | null,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const res = await applyCriteria(
      admin
        .from("master_customer")
        .select("customer_id", { count: "exact", head: true })
        .in("customer_id", chunk),
      criteria,
      masterFilterExpr,
    );
    if (res.error) throw res.error;
    total += res.count ?? 0;
  }
  return total;
}

/**
 * Resolve every id-set constraint (ecosystem / enrichment / multi-source / clinic / staging) to
 * DISTINCT customer_ids and INTERSECT them (AND). Returns null when NO id-set criterion is set
 * (i.e. only master columns narrow the pool). Shared by computeSegment (counts) and the export
 * (rows) so the two can never resolve a different audience. Every id is a master_customer
 * customer_id by construction, so the intersection ⊆ master_customer.
 *
 * Cross-table OR is not expressible in one PostgREST query, so these stay AND-only (the AND/OR
 * tree covers master columns only). The staging resolvers now use the migration-14 RPC (fast).
 */
export async function resolveRestrictIds(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
): Promise<Set<string> | null> {
  const idSets: Set<string>[] = [];
  if (criteria.ecoUnit || criteria.ecoProduct) {
    idSets.push(
      await resolveEcosystemCustomerIds(admin, (criteria.ecoUnit as EcosystemUnit | null) ?? null, criteria.ecoProduct),
    );
  }
  if (criteria.srcHyrox) idSets.push(await resolveEnrichmentCustomerIds(admin, "hyrox"));
  if (criteria.srcMy20fit) idSets.push(await resolveEnrichmentCustomerIds(admin, "my20fit"));
  if (criteria.srcRecency) idSets.push(await resolveEnrichmentCustomerIds(admin, "recency"));
  if (criteria.srcArena) idSets.push(await resolveMultiSourceCustomerIds(admin, "arena"));
  if (criteria.srcGym) idSets.push(await resolveMultiSourceCustomerIds(admin, "gym"));
  if (criteria.srcClinicPatient) idSets.push(await resolveClinicPatientCustomerIds(admin));
  if (criteria.srcClinicTxn) idSets.push(await resolveClinicTxnCustomerIds(admin));
  if (criteria.srcRfm) idSets.push(await resolveStagingRfmCustomerIds(admin, criteria.srcRfm));
  if (criteria.srcProgram) idSets.push(await resolveStagingProgramCustomerIds(admin, criteria.srcProgram));
  return intersectSets(idSets);
}

/** Apply criteria (or a validated master filter tree) to a master_customer query — exported so
 *  the export path narrows the parent EXACTLY as the segment count did. */
export function applyMasterCriteria<T>(q: T, criteria: SegmentCriteria, masterFilterExpr?: string | null): T {
  return applyCriteria(q, criteria, masterFilterExpr);
}

export async function computeSegment(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
  masterFilterExpr: string | null = null,
): Promise<SegmentCounts> {
  const restrictIds = await resolveRestrictIds(admin, criteria);

  // 1. Matched — count of master_customer rows meeting the criteria.
  let matched: number;
  if (!restrictIds) {
    const matchedRes = await applyCriteria(
      admin.from("master_customer").select("customer_id", { count: "exact", head: true }),
      criteria,
      masterFilterExpr,
    );
    if (matchedRes.error) throw matchedRes.error;
    matched = matchedRes.count ?? 0;
  } else if (restrictIds.size === 0) {
    matched = 0;
  } else if (!hasMasterCriteria(criteria, masterFilterExpr)) {
    // No master narrowing → the matched count IS the intersected id set (all ⊆ master).
    matched = restrictIds.size;
  } else {
    matched = await countMasterWithinIds(admin, criteria, Array.from(restrictIds), masterFilterExpr);
  }

  // 2. Contactable — RUN the rule via the shared inner-embed count, per purpose. Marketing and
  //    service are separate permissions (shown separately). Suppression is fetched ONCE and
  //    shared (suppression wins for both). The SAME applyCriteria narrows the parent, so the
  //    contactable counts respect the exact criteria + tree the matched count used. No rows
  //    are pulled — head:true throughout, so the backfill cannot truncate this.
  const applyMaster: ApplyMaster = (q) => applyCriteria(q, criteria, masterFilterExpr);
  const suppressed = await fetchSuppressedCustomerIds(admin);

  const [contactableMarketing, contactableService] = await Promise.all([
    countContactableForPurpose(admin, "marketing", applyMaster, restrictIds, suppressed),
    countContactableForPurpose(admin, "transactional", applyMaster, restrictIds, suppressed),
  ]);

  return { matched, contactableMarketing, contactableService };
}
