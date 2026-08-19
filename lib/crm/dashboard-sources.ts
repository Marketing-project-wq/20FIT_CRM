import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizePhoneID } from "./normalize";

/**
 * "Live source vs frozen pool" for the dashboard (Dashboard Visual sprint). The CRM pool
 * (master_customer) is a FROZEN snapshot — its last row loaded 31 Jul 2026, and no pipeline feeds
 * new sign-ups into it. Meanwhile the SOURCE systems keep growing. This module counts, per source,
 * how many distinct people are in the source and how many of them are NOT yet in the pool ("gap").
 * That gap is the honest answer to "does this update when a new user joins?": it rises on its own
 * as sources grow, without anything being ingested.
 *
 * WHY THE APP PATH (not one SQL query): the exact figure is a CTE + cross-table anti-join that
 * PostgREST cannot express, and this sprint adds NO migration/RPC for it. So we do it the way the
 * other read layers do: pull each source's identities (small — a few thousand total), then probe
 * master_customer's UNIQUE email/phone indexes in chunks. Server-only, read-only, zero writes,
 * zero copy. "In pool" means a matching master row exists (by normalised email or phone, K-06).
 *
 * NOT summed into one number: a person in two sources would be counted twice, and cross-source
 * dedup by different key types (email vs phone) is not reliable — so the UI shows per-source gaps
 * with that caveat, never a single fake-precise "total not in pool".
 */

const PAGE = 1000; // source pull page size
const CHUNK = 300; // .in() batch — bounded URL length; each is an index probe

export interface SourceGap {
  /** stable key for the dictionary label (never a stored value) */
  key: "my20fit" | "hyrox" | "arena" | "gym" | "clinic";
  /** distinct people in the source */
  total: number;
  /** of those, how many already have a pool profile */
  inPool: number;
  /** total − inPool: in the source, not yet in the CRM pool */
  gap: number;
}

/** Pull one text column from a table, paged. */
async function pullColumn(admin: SupabaseClient, table: string, col: string): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(col).range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, string | null>[];
    for (const r of rows) out.push(r[col]);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Which of `values` exist in master_customer.`column` (chunked index probes). */
async function poolHas(
  admin: SupabaseClient,
  column: "email_normalized" | "phone_normalized",
  values: string[],
): Promise<Set<string>> {
  const inPool = new Set<string>();
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    const { data, error } = await admin.from("master_customer").select(column).in(column, chunk);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as Record<string, string | null>[]) {
      const v = r[column];
      if (v) inPool.add(v);
    }
  }
  return inPool;
}

/** An email-keyed source (one or more tables sharing an `email` column). */
async function emailSourceGap(
  admin: SupabaseClient,
  key: SourceGap["key"],
  tables: string[],
): Promise<SourceGap> {
  const emails = new Set<string>();
  for (const t of tables) {
    for (const raw of await pullColumn(admin, t, "email")) {
      const e = normalizeEmail(raw);
      if (e) emails.add(e);
    }
  }
  const list = Array.from(emails);
  const inPoolSet = await poolHas(admin, "email_normalized", list);
  return { key, total: list.length, inPool: inPoolSet.size, gap: list.length - inPoolSet.size };
}

/** Clinic: phone-first OR email (K-06). A person counts as in-pool if either identity matches. */
async function clinicGap(admin: SupabaseClient): Promise<SourceGap> {
  const phones = await pullColumn(admin, "clinic_patients", "phone");
  const emails = await pullColumn(admin, "clinic_patients", "email");
  const people: { p: string | null; e: string | null }[] = [];
  const seen = new Set<string>();
  const n = Math.max(phones.length, emails.length);
  for (let i = 0; i < n; i++) {
    const p = normalizePhoneID(phones[i] ?? null);
    const e = normalizeEmail(emails[i] ?? null);
    const dedupKey = `${p ?? ""}|${e ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    people.push({ p, e });
  }
  const poolP = await poolHas(admin, "phone_normalized", people.map((x) => x.p).filter((x): x is string => !!x));
  const poolE = await poolHas(admin, "email_normalized", people.map((x) => x.e).filter((x): x is string => !!x));
  let inPool = 0;
  for (const { p, e } of people) if ((p && poolP.has(p)) || (e && poolE.has(e))) inPool++;
  return { key: "clinic", total: people.length, inPool, gap: people.length - inPool };
}

const ARENA_TABLES = ["arena_class_bookings", "arena_bookings", "arena_package_orders", "arena_members"];
const GYM_TABLES = ["gym_class_bookings", "gym_memberships", "gym_membership_orders"];

/**
 * Per-source live gaps. Non-fatal per source: if one source errors, it is omitted rather than
 * failing the whole dashboard (the caller treats a missing source as "couldn't measure").
 */
export async function fetchLiveSourceGaps(admin: SupabaseClient): Promise<SourceGap[]> {
  const jobs: Promise<SourceGap>[] = [
    emailSourceGap(admin, "my20fit", ["my20fit_profile"]),
    emailSourceGap(admin, "hyrox", ["cf_hyrox_participants"]),
    emailSourceGap(admin, "arena", ARENA_TABLES),
    emailSourceGap(admin, "gym", GYM_TABLES),
    clinicGap(admin),
  ];
  const settled = await Promise.allSettled(jobs);
  return settled
    .filter((s): s is PromiseFulfilledResult<SourceGap> => s.status === "fulfilled")
    .map((s) => s.value);
}
