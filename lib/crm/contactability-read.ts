import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactPurpose } from "./contactability";

/**
 * SCALABLE contactability counting — the read layer that feeds the dashboard + segment
 * builder. This module exists because the naive approach (SELECT every active consent row
 * into TypeScript, then .in() 80k ids) BREAKS after Migrasi 11's backfill: 408k consent rows
 * exceed PostgREST's max-rows limit and are silently truncated, producing a confidently wrong
 * "bisa dihubungi" number — the exact failure class this project keeps guarding against.
 *
 * THE FIX: count via a head:true count over an INNER EMBED of crm_consent. PostgREST nests
 * the child rows under each parent (master_customer) and, with `!inner`, keeps only parents
 * that have ≥1 matching child — WITHOUT duplicating the parent. So the count is the number of
 * DISTINCT profiles with an active consent for the purpose, transferring NO rows and hitting
 * no row cap. The criteria (master_customer columns) apply to the PARENT, so the same count
 * narrows a segment too. Suppression (identity-keyed, no FK) can't be embedded, so it is
 * subtracted: contactable = distinct-consenting − distinct-consenting-AND-suppressed.
 *
 * This is the SAME rule as isContactableForPurpose (suppression wins, fail-closed) expressed
 * as set arithmetic. The equality is VERIFIED after the backfill against a direct SQL
 * count(distinct customer_id) (Migrasi 11's mandatory check) — if the two ever disagree, the
 * read path is truncating and must be fixed before any number is trusted.
 */

/** Chunk size for `.in(customer_id, …)` — bounded URL length; each chunk is a head count,
 *  so no rows are read regardless of chunk size. */
const IN_CHUNK = 300;
/** Page size for the (small) suppression pulls. */
const PAGE_SIZE = 1000;

/** Apply master_customer filters (criteria / AND-OR tree) to a query builder. Injected by the
 *  caller so this module does not depend on the segment criteria shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApplyMaster = (q: any) => any;

const IDENTITY: ApplyMaster = (q) => q;

/**
 * head:true count of DISTINCT master_customer profiles that (a) pass `applyMaster` and (b)
 * have an ACTIVE consent row for `purpose`. When `ids` is given, restricts to those
 * customer_ids in chunks and sums. No rows are transferred.
 */
async function countProfilesWithConsent(
  admin: SupabaseClient,
  purpose: ContactPurpose,
  applyMaster: ApplyMaster,
  ids?: string[],
): Promise<number> {
  const base = () =>
    applyMaster(
      admin
        .from("master_customer")
        .select("customer_id, crm_consent!inner(customer_id)", { count: "exact", head: true })
        .eq("crm_consent.purpose", purpose)
        .eq("crm_consent.status", "active"),
    );

  if (!ids) {
    const { count, error } = await base();
    if (error) throw error;
    return count ?? 0;
  }

  let total = 0;
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { count, error } = await base().in("customer_id", chunk);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

/**
 * customer_ids in master_customer whose phone OR email is in ACTIVE suppression. Suppression
 * WINS (K-03). Suppression is keyed by identity value, so we page the active suppressed values
 * (small; the do-not-contact list) and resolve them to customer_ids via chunked .in() on the
 * normalized identity columns. Empty today (0 rows) → empty Set, and the subtraction is a
 * no-op — but present, so a future suppression row is honored without a code change.
 */
export async function fetchSuppressedCustomerIds(admin: SupabaseClient): Promise<Set<string>> {
  const phones: string[] = [];
  const emails: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("crm_suppression")
      .select("identity_kind, identity_key")
      .eq("status", "active")
      .not("identity_key", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { identity_kind: string; identity_key: string | null }[];
    for (const r of rows) {
      if (!r.identity_key) continue;
      if (r.identity_kind === "phone") phones.push(r.identity_key);
      else if (r.identity_kind === "email") emails.push(r.identity_key);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  const out = new Set<string>();
  async function resolve(column: "phone_normalized" | "email_normalized", values: string[]) {
    for (let i = 0; i < values.length; i += IN_CHUNK) {
      const { data, error } = await admin
        .from("master_customer")
        .select("customer_id")
        .in(column, values.slice(i, i + IN_CHUNK));
      if (error) throw error;
      for (const r of (data ?? []) as { customer_id: string | null }[]) {
        if (r.customer_id) out.add(r.customer_id);
      }
    }
  }
  await resolve("phone_normalized", phones);
  await resolve("email_normalized", emails);
  return out;
}

/**
 * DISTINCT profiles contactable for `purpose` = (profiles matching `applyMaster` with active
 * consent for the purpose) − (those among them that are suppressed). `restrictIds`, when
 * given, is an already-resolved id set (ecosystem / enrichment presence) the profile must
 * also be in; it is applied to BOTH terms so suppression-wins holds within the restriction.
 * All counting is head:true — no rows read, no truncation.
 */
export async function countContactableForPurpose(
  admin: SupabaseClient,
  purpose: ContactPurpose,
  applyMaster: ApplyMaster = IDENTITY,
  restrictIds: Set<string> | null = null,
  suppressed?: Set<string>,
): Promise<number> {
  const supp = suppressed ?? (await fetchSuppressedCustomerIds(admin));

  if (restrictIds) {
    const cand = Array.from(restrictIds);
    if (cand.length === 0) return 0;
    const withConsent = await countProfilesWithConsent(admin, purpose, applyMaster, cand);
    const suppCand = cand.filter((id) => supp.has(id));
    const suppWithConsent = suppCand.length
      ? await countProfilesWithConsent(admin, purpose, applyMaster, suppCand)
      : 0;
    return withConsent - suppWithConsent;
  }

  const total = await countProfilesWithConsent(admin, purpose, applyMaster);
  if (total === 0) return 0;
  if (supp.size === 0) return total;
  const suppWithConsent = await countProfilesWithConsent(
    admin,
    purpose,
    applyMaster,
    Array.from(supp),
  );
  return total - suppWithConsent;
}
