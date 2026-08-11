import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isContactableForMarketing,
  suppressionKey,
  type ConsentRow,
  type Identity,
} from "./contactability";
import { SEGMENT_NULL, type SegmentCriteria } from "./segment";

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
function applyCriteria(q: any, c: SegmentCriteria): any {
  let out = q;
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
  return out;
}

export async function computeSegment(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
): Promise<SegmentCounts> {
  // 1. Matched — count of master_customer rows meeting the criteria.
  const matchedRes = await applyCriteria(
    admin.from("master_customer").select("customer_id", { count: "exact", head: true }),
    criteria,
  );
  if (matchedRes.error) throw matchedRes.error;
  const matched = matchedRes.count ?? 0;

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

  // Candidate customers who ALSO match the criteria — apply the same filters.
  const ids = Array.from(byCustomer.keys());
  const profRes = await applyCriteria(
    admin.from("master_customer").select("customer_id, phone_normalized, email_normalized").in("customer_id", ids),
    criteria,
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
