import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countContactableForPurpose,
  fetchSuppressedCustomerIds,
  type ApplyMaster,
} from "./contactability-read";
import { SEGMENT_NULL, EMPTY_CRITERIA, hasExclusion, type SegmentCriteria } from "./segment";
import { resolveEcosystemCustomerIds } from "./engagement";
import { resolveEnrichmentCustomerIds } from "./enrichment";
import { resolveClinicTxnCustomerIds } from "./clinic-source";
import { resolveStagingRfmCustomerIds, resolveStagingProgramCustomerIds } from "./staging";
import { resolveMirrorSourceIds } from "./mirror";
import { resolveActivityTimeIds } from "./activity";
import type { EcosystemUnit } from "./engagement-constants";
import { unionSets, intersectSets } from "./id-sets";

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
 * tree covers master columns only). The staging resolvers use the migration-14 RPC (fast).
 *
 * Sprint 5A: the five source-PRESENCE flags (Hyrox / my20fit / arena / gym / clinic-patient) now
 * resolve from crm_customer_mirror in ONE indexed query (resolveMirrorSourceIds) instead of a
 * per-source scan + over-the-wire match each. Their AND-in-SQL equals the old per-set intersect
 * (each mirror flag == its live resolver for the current data — verified at apply time). The
 * criteria the mirror cannot reproduce — ecosystem unit/product, real recency, clinic-TXN
 * linkage, RFM buckets, and program/Fitco participation — stay on their live resolvers and are
 * intersected with the mirror set exactly as before. Consent/suppression are never in the mirror
 * and stay live in the contactable count (see computeSegment).
 */
export async function resolveRestrictIds(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
): Promise<Set<string> | null> {
  const idSets: Set<string>[] = [];
  // Mirror-served presence flags (Hyrox/my20fit/arena/gym/clinic-patient): one query, or null
  // when none of the five is active. clinic-patient stays gated on view_health at the route.
  const mirrorIds = await resolveMirrorSourceIds(admin, criteria);
  if (mirrorIds) idSets.push(mirrorIds);
  // Everything the mirror cannot reproduce stays on its live source path:
  if (criteria.ecoUnit || criteria.ecoProduct) {
    idSets.push(
      await resolveEcosystemCustomerIds(admin, (criteria.ecoUnit as EcosystemUnit | null) ?? null, criteria.ecoProduct),
    );
  }
  if (criteria.srcRecency) idSets.push(await resolveEnrichmentCustomerIds(admin, "recency"));
  if (criteria.srcClinicTxn) idSets.push(await resolveClinicTxnCustomerIds(admin));
  // Multi-value staging criteria: resolve each value to its id-set, UNION them (OR within the
  // criterion), then push the single union — which AND-intersects with everything else below.
  if (criteria.srcRfm.length) {
    const sets = await Promise.all(criteria.srcRfm.map((v) => resolveStagingRfmCustomerIds(admin, v)));
    idSets.push(unionSets(sets));
  }
  if (criteria.srcProgram.length) {
    const sets = await Promise.all(criteria.srcProgram.map((k) => resolveStagingProgramCustomerIds(admin, k)));
    idSets.push(unionSets(sets));
  }
  // TIME criteria (Fase 2): resolved against crm_customer_activity (real timestamps). Applies
  // only to profiles with an activity signal — intersected with the rest AND-only.
  const timeIds = await resolveActivityTimeIds(admin, criteria.joinedWithinDays, criteria.inactiveForDays);
  if (timeIds) idSets.push(timeIds);

  const positive = intersectSets(idSets);

  // EXCLUSION (Track A): subtract each active exclusion's id-set. The base is the positive
  // intersection if one exists, else the WHOLE pool (all master_customer ids) — "not a member,
  // never arena" over everyone. Subtracting each set in turn removes their UNION.
  if (!hasExclusion(criteria)) return positive;
  const excludeSets = await resolveExcludeSets(admin, criteria.exclude);
  if (excludeSets.length === 0) return positive; // nothing resolvable to exclude
  const base = positive ?? (await allMasterIds(admin));
  for (const ex of excludeSets) for (const id of Array.from(ex)) base.delete(id);
  return base;
}

/** Every customer_id in master_customer (paginated). Used only as the base for an exclusion-ONLY
 *  segment ("everyone EXCEPT app users"), where there is no positive id-set to subtract from. */
async function allMasterIds(admin: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as { customer_id: string }[]) out.add(r.customer_id);
    if (data.length < PAGE) break;
  }
  return out;
}

/** One id-set per ACTIVE exclusion dimension, each resolved by the SAME live resolver its positive
 *  twin uses (so "exclude member" removes exactly the profiles "is member" would have matched). */
async function resolveExcludeSets(
  admin: SupabaseClient,
  ex: SegmentCriteria["exclude"],
): Promise<Set<string>[]> {
  const sets: Set<string>[] = [];
  if (ex.ecoUnit) sets.push(await resolveEcosystemCustomerIds(admin, ex.ecoUnit as EcosystemUnit, null));
  if (ex.srcRecency) sets.push(await resolveEnrichmentCustomerIds(admin, "recency"));
  // Mirror-served flags: resolve each singly by handing the mirror resolver a criteria with only
  // that flag positive.
  const mirrorFlags: (keyof SegmentCriteria)[] = [];
  if (ex.srcArena) mirrorFlags.push("srcArena");
  if (ex.srcGym) mirrorFlags.push("srcGym");
  if (ex.srcHyrox) mirrorFlags.push("srcHyrox");
  if (ex.srcMy20fit) mirrorFlags.push("srcMy20fit");
  for (const flag of mirrorFlags) {
    const single = await resolveMirrorSourceIds(admin, { ...EMPTY_CRITERIA, [flag]: true });
    if (single) sets.push(single);
  }
  return sets;
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
