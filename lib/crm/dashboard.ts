import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isContactableForMarketing,
  suppressionKey,
  type ConsentRow,
  type Identity,
} from "./contactability";

/**
 * Dashboard KPI stats — READ-ONLY aggregates over the EXISTING master_customer +
 * crm_consent + crm_suppression. Same posture as lib/crm/quality.ts: server-only,
 * service-role client passed in by the caller (which owns auth + RBAC), no write path.
 * No individual customer row is exposed to the client (only counts), so nothing to
 * mask and no per-view audit.
 *
 * The `—` vs `0` distinction is enforced at the UI, but the SHAPE supports it: a field
 * this layer cannot source is absent from the type. `contactable` is now a MEASURED 0
 * (derived from the contactability rule over the live tables), not a hardcoded literal.
 */
export interface DashboardStats {
  /** Rows in master_customer. Real, sourced. */
  audienceSize: number;
  /** Contactable-for-marketing count, DERIVED from crm_consent + crm_suppression via
   *  the isContactableForMarketing rule. 0 today because crm_consent is empty — a
   *  measured 0, not a written one. */
  contactable: number;
  /** Most recent created_at, or null if the table is empty. This is data FRESHNESS,
   *  not a growth signal — master_customer arrived as batch loads, not a live feed. */
  lastProfileAt: string | null;
}

interface ConsentDbRow {
  customer_id: string | null;
  channel: string;
  purpose: string;
  status: string;
}

/**
 * Count contactable-for-marketing profiles by RUNNING the rule, not by trusting any
 * single column. Fail-closed and short-circuiting: no active marketing consent -> 0,
 * without even reading suppression or profiles. Today that returns 0 immediately.
 */
async function fetchContactableCount(admin: SupabaseClient): Promise<number> {
  // 1. Customers with an ACTIVE MARKETING consent row (the only ones that can qualify).
  const { data: consentData, error: consentErr } = await admin
    .from("crm_consent")
    .select("customer_id, channel, purpose, status")
    .eq("purpose", "marketing")
    .eq("status", "active")
    .not("customer_id", "is", null);
  if (consentErr) throw consentErr;

  const consentRows = (consentData ?? []) as ConsentDbRow[];
  if (consentRows.length === 0) return 0; // fail-closed: absence of consent = 0

  const byCustomer = new Map<string, ConsentRow[]>();
  for (const r of consentRows) {
    if (!r.customer_id) continue;
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push({ channel: r.channel, purpose: r.purpose, status: r.status });
    byCustomer.set(r.customer_id, list);
  }

  // 2. Active suppression keys (suppression WINS). identity_key is normalized the same
  //    way as master_customer.phone_normalized/email_normalized (62… canon, D-2).
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

  // 3. Identities of the candidate customers, then apply the rule per profile.
  const ids = Array.from(byCustomer.keys());
  const { data: profData, error: profErr } = await admin
    .from("master_customer")
    .select("customer_id, phone_normalized, email_normalized")
    .in("customer_id", ids);
  if (profErr) throw profErr;

  let count = 0;
  for (const p of (profData ?? []) as {
    customer_id: string;
    phone_normalized: string | null;
    email_normalized: string | null;
  }[]) {
    const identities: Identity[] = [];
    if (p.phone_normalized) identities.push({ kind: "phone", key: p.phone_normalized });
    if (p.email_normalized) identities.push({ kind: "email", key: p.email_normalized });
    if (isContactableForMarketing(byCustomer.get(p.customer_id) ?? [], identities, suppSet)) {
      count++;
    }
  }
  return count;
}

export async function fetchDashboardStats(admin: SupabaseClient): Promise<DashboardStats> {
  const sizeQ = admin.from("master_customer").select("*", { count: "exact", head: true });

  const freshQ = admin
    .from("master_customer")
    .select("created_at")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const [{ count, error: sizeErr }, { data: fresh, error: freshErr }, contactable] =
    await Promise.all([sizeQ, freshQ, fetchContactableCount(admin)]);
  if (sizeErr) throw sizeErr;
  if (freshErr) throw freshErr;

  return {
    audienceSize: count ?? 0,
    contactable,
    lastProfileAt: (fresh as { created_at: string | null } | null)?.created_at ?? null,
  };
}
