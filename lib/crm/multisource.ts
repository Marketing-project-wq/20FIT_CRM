import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizePhoneID } from "./normalize";
import {
  MULTISOURCE_DEFS,
  phoneMatchCandidates,
  type MatchKey,
  type MultiSourceDef,
} from "./multisource-constants";
import type { SourceCoverage } from "./quality-types";

/**
 * Multi-source profile completion (TUGAS 3) — READ-ONLY, server-only, service-role client
 * passed in by the route. Matches a profile to the arena/gym booking sources by NORMALISED
 * EMAIL first, then NORMALISED PHONE (K-06) — never by name. The matched key is recorded so
 * the confidence shows on screen.
 *
 * ZERO write to master_customer / crm_*. The profile's real email + phone are read server-side
 * ONLY (by customer_id) to compute the match; they never leave this layer. Only the per-source
 * safeColumns are selected (guarded by multisource.test.ts). Rows are capped for display.
 *
 * The clinic_* chain (patient_id, health data behind profile.view_health), /quality coverage,
 * and segment filters are NOT here — see docs/RENCANA-multisumber.md.
 */

const ROW_CAP = 20; // per source; a profile view is not an export

/** Resolved class-name chain for one booking row (TUGAS 4). `resolved` is false when the class
 *  name could NOT be found (null schedule_id, or a deleted schedule/type) — the UI shows the
 *  booking code with a "class name not found" note, never a guessed name and never hidden. */
export interface ClassInfo {
  resolved: boolean;
  name: string | null;
  scheduleDate: string | null;
  startTime: string | null;
  endTime: string | null;
  instructor: string | null;
}

export interface MultiSourceRow {
  label: string | null; // the labelColumn value (e.g. a booking code)
  status: string | null;
  extra: Record<string, unknown>; // remaining safe columns, for the UI to render as it likes
  /** Present only on class-booking sources — the resolved (or unresolved) class name + schedule. */
  classInfo?: ClassInfo;
}

export interface MultiSourceResult {
  key: string;
  label: string;
  matched: boolean;
  /** Which identity produced the match — shown as a confidence cue. null when unmatched. */
  keyUsed: MatchKey | null;
  count: number;
  rows: MultiSourceRow[];
}

export interface ProfileMultiSource {
  /** false when the profile has neither email nor phone to match on. */
  matchable: boolean;
  sources: MultiSourceResult[];
}

/** Case-insensitive exact email match (no wildcards in the value). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectByEmail(admin: SupabaseClient, def: MultiSourceDef, email: string): any {
  return admin
    .from(def.table)
    .select(def.safeColumns.join(","))
    .ilike(def.emailColumn, email)
    .limit(ROW_CAP);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectByPhone(admin: SupabaseClient, def: MultiSourceDef, candidates: string[]): any {
  return admin
    .from(def.table)
    .select(def.safeColumns.join(","))
    .in(def.phoneColumn as string, candidates)
    .limit(ROW_CAP);
}

function toRows(def: MultiSourceDef, data: Record<string, unknown>[]): MultiSourceRow[] {
  const scheduleIdCol = def.classChain?.scheduleIdColumn;
  return data.map((r) => {
    const extra: Record<string, unknown> = {};
    for (const col of def.safeColumns) {
      if (col === def.labelColumn || col === def.statusColumn) continue;
      if (col === scheduleIdCol) continue; // a join key, resolved into classInfo — not raw display
      extra[col] = r[col];
    }
    return {
      label: (r[def.labelColumn] as string | null) ?? null,
      status: def.statusColumn ? ((r[def.statusColumn] as string | null) ?? null) : null,
      extra,
    };
  });
}

/**
 * Resolve the class NAME + schedule facts for a set of booking rows (TUGAS 4). Two targeted
 * lookups keyed by the schedule ids present in THIS profile's rows (≤ ROW_CAP): schedules by id,
 * then types by class_type_id. Attaches `classInfo` to each row IN PLACE. A row whose schedule_id
 * is null, or whose schedule/type is missing (deleted), gets `resolved: false` — never a guessed
 * name, never dropped. Only the tested safe columns are selected from the two chain tables.
 */
async function resolveClassInfo(
  admin: SupabaseClient,
  def: MultiSourceDef,
  data: Record<string, unknown>[],
  rows: MultiSourceRow[],
): Promise<void> {
  const chain = def.classChain;
  if (!chain) return;

  const scheduleIds = Array.from(
    new Set(data.map((r) => r[chain.scheduleIdColumn] as string | null).filter((v): v is string => !!v)),
  );

  // schedule id → { class_type_id, schedule_date, start_time, end_time, instructor }
  const schedById = new Map<string, Record<string, unknown>>();
  if (scheduleIds.length > 0) {
    const { data: sch, error } = await admin
      .from(chain.scheduleTable)
      .select(chain.scheduleColumns.join(","))
      .in("id", scheduleIds);
    if (error) throw error;
    for (const s of (sch ?? []) as unknown as Record<string, unknown>[]) {
      schedById.set(s.id as string, s);
    }
  }

  // class_type_id → name
  const typeIds = Array.from(
    new Set(Array.from(schedById.values()).map((s) => s.class_type_id as string | null).filter((v): v is string => !!v)),
  );
  const nameById = new Map<string, string | null>();
  if (typeIds.length > 0) {
    const { data: types, error } = await admin
      .from(chain.typeTable)
      .select(chain.typeColumns.join(","))
      .in("id", typeIds);
    if (error) throw error;
    for (const t of (types ?? []) as unknown as Record<string, unknown>[]) {
      nameById.set(t.id as string, (t.name as string | null) ?? null);
    }
  }

  data.forEach((r, i) => {
    const sid = r[chain.scheduleIdColumn] as string | null;
    const sched = sid ? schedById.get(sid) : undefined;
    const typeId = sched?.class_type_id as string | null | undefined;
    const name = typeId ? nameById.get(typeId) ?? null : null;
    rows[i].classInfo = {
      resolved: name != null,
      name,
      scheduleDate: (sched?.schedule_date as string | null) ?? null,
      startTime: (sched?.start_time as string | null) ?? null,
      endTime: (sched?.end_time as string | null) ?? null,
      instructor: (sched?.instructor as string | null) ?? null,
    };
  });
}

export async function fetchProfileMultiSource(
  admin: SupabaseClient,
  customerId: string,
): Promise<ProfileMultiSource> {
  // Real identity, server-side only — never returned to the client.
  const { data: prof, error: profErr } = await admin
    .from("master_customer")
    .select("email_normalized, phone_normalized")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (profErr) throw profErr;

  const p = prof as { email_normalized: string | null; phone_normalized: string | null } | null;
  const email = normalizeEmail(p?.email_normalized ?? null);
  const phone = normalizePhoneID(p?.phone_normalized ?? null);

  if (!email && !phone) {
    return { matchable: false, sources: [] };
  }

  const phoneCandidates = phone ? phoneMatchCandidates(phone) : [];

  const sources: MultiSourceResult[] = [];
  for (const def of MULTISOURCE_DEFS) {
    let matchKey: MatchKey | null = null;
    let data: Record<string, unknown>[] = [];

    // Email first.
    if (email) {
      const { data: d, error } = await selectByEmail(admin, def, email);
      if (error) throw error;
      if ((d ?? []).length > 0) {
        data = d as Record<string, unknown>[];
        matchKey = "email";
      }
    }
    // Phone fallback — only if email did not match and the source + profile have a phone.
    if (!matchKey && def.phoneColumn && phoneCandidates.length > 0) {
      const { data: d, error } = await selectByPhone(admin, def, phoneCandidates);
      if (error) throw error;
      if ((d ?? []).length > 0) {
        data = d as Record<string, unknown>[];
        matchKey = "phone";
      }
    }

    const rows = toRows(def, data);
    // Resolve class names for class-booking sources (TUGAS 4) — only when this source matched.
    if (def.classChain && data.length > 0) {
      await resolveClassInfo(admin, def, data, rows);
    }

    sources.push({
      key: def.key,
      label: def.label,
      matched: matchKey !== null,
      keyUsed: matchKey,
      count: data.length,
      rows,
    });
  }

  return { matchable: true, sources };
}

// ── COVERAGE (TUGAS 4): how many profiles each source reaches, for /quality ──────────────

const PAGE = 1000;
const CEILING = 200_000;

async function rowCount(
  admin: SupabaseClient,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine?: (q: any) => any,
): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (refine) q = refine(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Distinct master customer_ids whose email appears (normalised) in one source table. */
async function emailMatchedIds(admin: SupabaseClient, def: MultiSourceDef): Promise<Set<string>> {
  const emails = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(def.table)
      .select(def.emailColumn)
      .not(def.emailColumn, "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of batch) {
      const e = normalizeEmail(r[def.emailColumn] as string | null);
      if (e) emails.add(e);
    }
    if (batch.length < PAGE) break;
    if (emails.size > CEILING) throw new Error("multisource email set exceeded ceiling");
  }
  const ids = new Set<string>();
  if (emails.size === 0) return ids;
  const list = Array.from(emails);
  const CHUNK = 300;
  for (let i = 0; i < list.length; i += CHUNK) {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id")
      .in("email_normalized", list.slice(i, i + CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as { customer_id: string }[]) ids.add(r.customer_id);
  }
  return ids;
}

/** Coverage for every arena/gym source (email-matched). Live, per request. */
export async function fetchMultiSourceCoverage(admin: SupabaseClient): Promise<SourceCoverage[]> {
  const out: SourceCoverage[] = [];
  for (const def of MULTISOURCE_DEFS) {
    const [sourceRows, withKey, matched] = await Promise.all([
      rowCount(admin, def.table),
      rowCount(admin, def.table, (q) => q.not(def.emailColumn, "is", null)),
      emailMatchedIds(admin, def),
    ]);
    out.push({ key: def.key, label: def.label, sourceRows, withKey, matchedProfiles: matched.size, keyUsed: "email" });
  }
  return out;
}

/** Segment resolver (TUGAS 2): master customer_ids present in ANY arena OR gym source (email
 *  match, K-06). Returns a customer_id set for intersection in computeSegment (AND-only). */
export async function resolveMultiSourceCustomerIds(
  admin: SupabaseClient,
  group: "arena" | "gym",
): Promise<Set<string>> {
  const defs = MULTISOURCE_DEFS.filter((d) => d.key.startsWith(group));
  const out = new Set<string>();
  for (const def of defs) {
    const ids = await emailMatchedIds(admin, def);
    ids.forEach((id) => out.add(id));
  }
  return out;
}
