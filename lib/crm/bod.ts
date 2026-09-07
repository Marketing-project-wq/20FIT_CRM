import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Data layer for the BOD screen. Every figure here is COMPUTED FROM DATA at request time — none is
 * written into an i18n string, and none is carried over from a previous measurement (K-60).
 *
 * That rule exists because of what it replaced. Four dashboard captions asserted things that had
 * quietly stopped being true: "no workflow table yet" (crm_workflow exists, with 36 enrolments
 * waiting), "2 loads: 20 Apr & 31 Jul" (there are THREE), "zero new profiles since 1 August"
 * (577 arrived on 27 August). None was written to mislead; every one was true the day it was
 * typed. What broke was WHERE the fact lived — in a translation file, a layer nothing re-checks.
 *
 * So the shape of this module is the decision: a function per figure, each doing its own counting.
 * If a number cannot be counted, this layer does not return it — the screen shows an em dash
 * rather than a stale literal (K-08).
 */

/** ── Card 1: reach ──────────────────────────────────────────────────────────────────────────
 *  Replaces the old "Contactable · marketing" / "Contactable · service" pair, which was wrong in
 *  two ways at once. (1) It printed the SAME number twice — migration 11's backfill wrote both a
 *  marketing and a transactional consent row for the same people, so the two counts were equal by
 *  construction, not by coincidence. (2) "service" is not a value this system has: crm_consent's
 *  purpose CHECK admits `marketing` and `transactional` ONLY (verified 7 Sep 2026, zero rows with
 *  any other value). The card was labelling a category that does not exist.
 *
 *  What replaces it is the question someone actually asks: how many people can we REACH, and on
 *  which channel. Email and WhatsApp are counted separately and never merged — the difference is
 *  real people who have one identity and not the other. */
export interface Reach {
  /** Profiles with a normalised email that no active suppression covers. */
  emailable: number;
  /** Profiles with a normalised phone that no active suppression covers. */
  whatsappable: number;
  /** Rows in master_customer — the denominator, not a reach figure. */
  poolTotal: number;
  /** DISTINCT people for whom the provider has ever ACCEPTED a message (sent | delivered |
   *  bounced). A bounce still means the provider took it, so it belongs here; `failed` does not —
   *  those never left. Counted as PEOPLE, not rows: 128 accepted rows cover 126 people. */
  everContacted: number;
}

/**
 * Suppression is resolved to `customer_id`, NOT to a channel — so one unsubscribe removes the
 * person from BOTH the email and the WhatsApp count. That is what the code does today and this
 * function reproduces it faithfully rather than quietly improving it; see T-57 for why that is
 * recorded as a finding and not changed here.
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

export async function fetchReach(admin: SupabaseClient): Promise<Reach> {
  const suppressed = await activeSuppressedCustomerIds(admin);

  // Two head-counts for the identity totals, then subtract only those suppressed people who
  // actually HAVE that identity. Doing it this way keeps the query cheap on 82k rows and keeps
  // the arithmetic visible: total − (suppressed ∩ has-identity), never an unexplained delta.
  const [emailTotal, phoneTotal, accepted] = await Promise.all([
    admin.from("master_customer").select("*", { count: "exact", head: true }).not("email_normalized", "is", null),
    admin.from("master_customer").select("*", { count: "exact", head: true }).not("phone_normalized", "is", null),
    admin.from("crm_message_log").select("customer_id").in("status", ["sent", "delivered", "bounced"]),
  ]);
  if (emailTotal.error) throw emailTotal.error;
  if (phoneTotal.error) throw phoneTotal.error;
  if (accepted.error) throw accepted.error;

  let suppressedWithEmail = 0;
  let suppressedWithPhone = 0;
  if (suppressed.length > 0) {
    const [se, sp] = await Promise.all([
      admin
        .from("master_customer")
        .select("*", { count: "exact", head: true })
        .in("customer_id", suppressed)
        .not("email_normalized", "is", null),
      admin
        .from("master_customer")
        .select("*", { count: "exact", head: true })
        .in("customer_id", suppressed)
        .not("phone_normalized", "is", null),
    ]);
    if (se.error) throw se.error;
    if (sp.error) throw sp.error;
    suppressedWithEmail = se.count ?? 0;
    suppressedWithPhone = sp.count ?? 0;
  }

  const people = new Set<string>();
  for (const r of (accepted.data ?? []) as { customer_id: string | null }[]) if (r.customer_id) people.add(r.customer_id);

  const poolTotal = await admin.from("master_customer").select("*", { count: "exact", head: true });
  if (poolTotal.error) throw poolTotal.error;

  return {
    emailable: (emailTotal.count ?? 0) - suppressedWithEmail,
    whatsappable: (phoneTotal.count ?? 0) - suppressedWithPhone,
    poolTotal: poolTotal.count ?? 0,
    everContacted: people.size,
  };
}

/** ── Card 2: how the audience grew ──────────────────────────────────────────────────────────
 *  One entry per LOAD: the day profiles were added, and how many. */
export interface Load {
  /** ISO timestamp of the load (every row in one load shares it to the microsecond). */
  at: string;
  count: number;
}

export interface LoadHistory {
  loads: Load[];
  /** True when the discovery loop hit its cap — the list is then a PREFIX, not the whole history,
   *  and the screen must say so instead of drawing a chart that looks complete. */
  truncated: boolean;
}

/** Discovery is capped so this can never become an unbounded walk if the pool ever starts
 *  receiving rows one at a time. Today the answer is 3; the cap is far above that and the
 *  `truncated` flag is what keeps a future breach honest instead of silent. */
const MAX_LOADS = 40;

/**
 * READ FROM `created_at`. NOT from `first_seen_at` — and this is not a stylistic preference, so do
 * not "fix" it later because the other column's name sounds more apt.
 *
 * Measured 7 Sep 2026 on the live pool:
 *   created_at     → 3 distinct days
 *   first_seen_at  → 163 distinct days
 *
 * They are not two views of the same thing. `created_at` is when the ROW was written into this
 * CRM: every row of a load carries the identical microsecond stamp (2026-04-20 18:28:33.232369 for
 * all 81,178 rows of the first load), because a load is one bulk insert. `first_seen_at` is when
 * the PERSON was first seen in the ORIGIN system, which is a property carried in from elsewhere —
 * a different clock entirely (K-19). Charting growth off `first_seen_at` would draw 163 bars of a
 * history this CRM did not live through, and would hide the one fact the chart exists to show:
 * profiles arrive in a handful of manual bulk loads, and no pipeline adds them in between.
 *
 * The walk itself: take the earliest `created_at`, count the rows sharing it, then ask for the
 * next value strictly greater. Round-trips = number of loads + 1 (four today). Nothing about the
 * number of loads, or their dates, is assumed anywhere — that is the point (K-60).
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

/** ── Card 4: delivery health ────────────────────────────────────────────────────────────────
 *  Send OUTCOMES (rows in the send log), plus the two standing queues. Rows, not people: a person
 *  messaged twice is two delivery outcomes, and this card is about the sending, not the audience. */
export interface DeliveryHealth {
  delivered: number;
  bounced: number;
  /** Rows the provider never accepted. Kept on the card because 18,119 of them is the whole reason
   *  this sprint exists — a run that failed 18k times was filed as `sent` (T-42). */
  failed: number;
  /** Active suppression rows: people who asked to stop. */
  unsubscribed: number;
  /** Workflow enrolments still waiting to be sent. */
  workflowQueued: number;
}

export async function fetchDeliveryHealth(admin: SupabaseClient): Promise<DeliveryHealth> {
  const head = (table: string) => admin.from(table).select("*", { count: "exact", head: true });
  const [delivered, bounced, failed, unsub, queued] = await Promise.all([
    head("crm_message_log").eq("status", "delivered"),
    head("crm_message_log").eq("status", "bounced"),
    head("crm_message_log").eq("status", "failed"),
    head("crm_suppression").is("lifted_at", null),
    head("crm_workflow_enrollment").eq("status", "queued"),
  ]);
  for (const r of [delivered, bounced, failed, unsub, queued]) if (r.error) throw r.error;
  return {
    delivered: delivered.count ?? 0,
    bounced: bounced.count ?? 0,
    failed: failed.count ?? 0,
    unsubscribed: unsub.count ?? 0,
    workflowQueued: queued.count ?? 0,
  };
}
