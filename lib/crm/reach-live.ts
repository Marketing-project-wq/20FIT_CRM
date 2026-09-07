import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reach, Load } from "./bod";

/**
 * LIVE reach + load history, counted at request time. These feed the OPERATIONAL dashboard, which
 * is a live screen by design — its blocks each paint as they arrive and each states its own basis.
 *
 * DO NOT USE THESE ON THE BOARD SCREEN. That page reads one daily snapshot and stamps itself with
 * the snapshot's `refreshed_at` (K-63); one live figure among the snapshot figures would silently
 * reintroduce the two-freshness problem the design exists to remove. They were split out of
 * lib/crm/bod.ts when that module became snapshot-only, so the separation is visible in the import
 * rather than resting on someone remembering the rule.
 */

async function activeSuppressedCustomerIds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from("crm_suppression")
    .select("customer_id")
    .is("lifted_at", null)
    .not("customer_id", "is", null);
  if (error) throw error;
  const ids = new Set<string>();
  for (const r of (data ?? []) as { customer_id: string | null }[]) if (r.customer_id) ids.add(r.customer_id);
  return Array.from(ids);
}

/** Suppression resolves to customer_id, NOT to a channel, so one unsubscribe removes the person
 *  from BOTH counts. Reproduced faithfully rather than quietly improved — see T-57. */
export async function fetchReach(admin: SupabaseClient): Promise<Reach> {
  const suppressed = await activeSuppressedCustomerIds(admin);

  const [emailTotal, phoneTotal, accepted, poolTotal] = await Promise.all([
    admin.from("master_customer").select("*", { count: "exact", head: true }).not("email_normalized", "is", null),
    admin.from("master_customer").select("*", { count: "exact", head: true }).not("phone_normalized", "is", null),
    admin.from("crm_message_log").select("customer_id").in("status", ["sent", "delivered", "bounced"]),
    admin.from("master_customer").select("*", { count: "exact", head: true }),
  ]);
  for (const r of [emailTotal, phoneTotal, accepted, poolTotal]) if (r.error) throw r.error;

  let suppressedWithEmail = 0;
  let suppressedWithPhone = 0;
  if (suppressed.length > 0) {
    const [se, sp] = await Promise.all([
      admin.from("master_customer").select("*", { count: "exact", head: true })
        .in("customer_id", suppressed).not("email_normalized", "is", null),
      admin.from("master_customer").select("*", { count: "exact", head: true })
        .in("customer_id", suppressed).not("phone_normalized", "is", null),
    ]);
    if (se.error) throw se.error;
    if (sp.error) throw sp.error;
    suppressedWithEmail = se.count ?? 0;
    suppressedWithPhone = sp.count ?? 0;
  }

  // DISTINCT people, not rows: a bounce means the provider accepted the message, so it counts;
  // `failed` never left, so it does not.
  const people = new Set<string>();
  for (const r of (accepted.data ?? []) as { customer_id: string | null }[]) if (r.customer_id) people.add(r.customer_id);

  return {
    emailable: (emailTotal.count ?? 0) - suppressedWithEmail,
    whatsappable: (phoneTotal.count ?? 0) - suppressedWithPhone,
    poolTotal: poolTotal.count ?? 0,
    everContacted: people.size,
  };
}

export interface LoadHistory {
  loads: Load[];
  /** The discovery walk hit its cap — `loads` is a PREFIX, and the caller must say so rather than
   *  present a partial list as the whole history. */
  truncated: boolean;
}

/** Capped so this can never become an unbounded walk if the pool ever starts receiving rows one at
 *  a time. Today the answer is 3; the flag is what keeps a future breach honest instead of silent. */
const MAX_LOADS = 40;

/**
 * READ FROM `created_at`, NOT `first_seen_at` — and this is not a preference, so do not "fix" it
 * later because the other column's name sounds more apt. Measured 7 Sep 2026: created_at yields 3
 * distinct days, first_seen_at yields 163. They are different clocks (K-19): created_at is when the
 * row was written HERE (every row of a load shares the microsecond, because a load is one bulk
 * insert), first_seen_at is when the ORIGIN system first saw the person.
 *
 * The walk: take the earliest created_at, count the rows sharing it, ask for the next value
 * strictly greater. Round-trips = loads + 1 (four today). Nothing about the number of loads or
 * their dates is assumed anywhere — that is the point (K-60).
 */
export async function fetchLoadHistory(admin: SupabaseClient): Promise<LoadHistory> {
  const loads: Load[] = [];
  let after: string | null = null;

  for (let i = 0; i < MAX_LOADS; i++) {
    let q = admin
      .from("master_customer")
      .select("created_at")
      .not("created_at", "is", null)
      .order("created_at", { ascending: true })
      .limit(1);
    if (after !== null) q = q.gt("created_at", after);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    const at = (data as { created_at: string | null } | null)?.created_at ?? null;
    if (at === null) return { loads, truncated: false };

    const { count, error: cErr } = await admin
      .from("master_customer")
      .select("*", { count: "exact", head: true })
      .eq("created_at", at);
    if (cErr) throw cErr;

    loads.push({ at, count: count ?? 0 });
    after = at;
  }
  return { loads, truncated: true };
}
