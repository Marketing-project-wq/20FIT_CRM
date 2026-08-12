import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isContactableForMarketing,
  suppressionKey,
  type ConsentRow,
  type Identity,
} from "./contactability";
import { SEGMENT_NULL, type SegmentCriteria } from "./segment";
import { resolveEcosystemCustomerIds } from "./engagement";
import { resolveEnrichmentCustomerIds } from "./enrichment";
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
 * Returns ONLY counts: how many match, and how many of those are contactable. It never
 * returns rows — a segment builder that emits a list of people is an export without a
 * name (Sprint 3M). If someone wants to see the people, that's /audience's job (masked,
 * audited). Server-only; the service-role client is passed in by the route.
 *
 * `contactable` is DERIVED from the existing rule (isContactableForMarketing, K-03), never
 * a second rule. It short-circuits to 0 when crm_consent has no active marketing row —
 * which is every segment today, and the point the screen exists to show.
 */

export interface SegmentCounts {
  matched: number;
  contactable: number;
}

interface ConsentDbRow {
  customer_id: string | null;
  channel: string;
  purpose: string;
  status: string;
}

/** Apply the criteria filters to a master_customer query. Shared by the matched-count and
 *  the contactable candidate query so they can never diverge. The builder types are
 *  awkward to type generically, so `any` mirrors the existing read layers. */
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

export async function computeSegment(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
  masterFilterExpr: string | null = null,
): Promise<SegmentCounts> {
  // Resolve every id-set constraint to DISTINCT customer_ids, then INTERSECT them (AND):
  //   - Sprint 3N: ecosystem presence (customer_engagement unit/product)
  //   - Sprint 3R: unmatched-source presence (Hyrox / my20fit / real-recency), by email
  // Cross-table OR is not expressible in one PostgREST query, so these stay AND-only
  // (consistent with the ecosystem criteria; the AND/OR tree covers master columns only).
  // Every id in these sets is a master_customer.customer_id by construction (eco: 0 orphan;
  // enrichment: resolved FROM master_customer), so the intersection ⊆ master_customer.
  const idSets: Set<string>[] = [];
  if (criteria.ecoUnit || criteria.ecoProduct) {
    idSets.push(
      await resolveEcosystemCustomerIds(admin, (criteria.ecoUnit as EcosystemUnit | null) ?? null, criteria.ecoProduct),
    );
  }
  if (criteria.srcHyrox) idSets.push(await resolveEnrichmentCustomerIds(admin, "hyrox"));
  if (criteria.srcMy20fit) idSets.push(await resolveEnrichmentCustomerIds(admin, "my20fit"));
  if (criteria.srcRecency) idSets.push(await resolveEnrichmentCustomerIds(admin, "recency"));
  const restrictIds = intersectSets(idSets);

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

  // 2. Contactable — RUN the rule, don't trust a column. Start from active marketing
  //    consent; today that set is empty, so this returns 0 without touching profiles.
  const { data: consentData, error: consentErr } = await admin
    .from("crm_consent")
    .select("customer_id, channel, purpose, status")
    .eq("purpose", "marketing")
    .eq("status", "active")
    .not("customer_id", "is", null);
  if (consentErr) throw consentErr;
  const consentRows = (consentData ?? []) as ConsentDbRow[];
  if (consentRows.length === 0) return { matched, contactable: 0 }; // fail-closed: no consent = 0

  const byCustomer = new Map<string, ConsentRow[]>();
  for (const r of consentRows) {
    if (!r.customer_id) continue;
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push({ channel: r.channel, purpose: r.purpose, status: r.status });
    byCustomer.set(r.customer_id, list);
  }

  // Active suppression keys (suppression WINS, K-03).
  const { data: suppData, error: suppErr } = await admin
    .from("crm_suppression")
    .select("identity_kind, identity_key")
    .eq("status", "active");
  if (suppErr) throw suppErr;
  const suppSet = new Set(
    (suppData ?? []).map((s: { identity_kind: string; identity_key: string }) =>
      suppressionKey(s.identity_kind, s.identity_key),
    ),
  );

  // Candidate customers who ALSO match the criteria — apply the same filters. When an
  // ecosystem criterion is set, the candidate set is first intersected with ecoIds so the
  // contactable count respects ecosystem presence exactly like matched does.
  let ids = Array.from(byCustomer.keys());
  if (restrictIds) ids = ids.filter((id) => restrictIds.has(id));
  if (ids.length === 0) return { matched, contactable: 0 };
  const profRes = await applyCriteria(
    admin.from("master_customer").select("customer_id, phone_normalized, email_normalized").in("customer_id", ids),
    criteria,
    masterFilterExpr,
  );
  if (profRes.error) throw profRes.error;

  let contactable = 0;
  for (const p of (profRes.data ?? []) as {
    customer_id: string;
    phone_normalized: string | null;
    email_normalized: string | null;
  }[]) {
    const identities: Identity[] = [];
    if (p.phone_normalized) identities.push({ kind: "phone", key: p.phone_normalized });
    if (p.email_normalized) identities.push({ kind: "email", key: p.email_normalized });
    if (isContactableForMarketing(byCustomer.get(p.customer_id) ?? [], identities, suppSet)) {
      contactable++;
    }
  }
  return { matched, contactable };
}
