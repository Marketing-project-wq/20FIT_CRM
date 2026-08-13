import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./normalize";
import {
  STAGING_TABLE,
  STAGING_COLUMNS,
  STAGING_PROGRAMS,
  STAGING_RFM_VALUES,
  STAGING_UMUR_SNAPSHOT,
  parseStagingDob,
  ageFromIso,
  isParticipation,
  isRfmValue,
  programByKey,
  type DobParse,
  type ProgramDef,
} from "./staging-constants";
import type { StagingImportCoverage } from "./quality-types";

/**
 * `staging_20fit_data` read layer (Sprint 3Y) — READ-ONLY, server-only, service-role client
 * passed in by the route. Matches a profile by NORMALISED EMAIL (K-06) — never by name. This is
 * the SAME import as master_customer and matches ~98,6% by email, so it fills the birth date,
 * program participation and RFM that master_customer lost at import.
 *
 * ZERO write, ZERO copy into master_customer / crm_*. Read + join at display time.
 *
 * SECURITY (T-02): the table is RLS OFF — already readable via the anon key without login.
 * Reading it here does not widen exposure; it puts the data behind the CRM's gate + audit. The
 * columns read are pinned to the maps in staging-constants.ts (guard-tested); raw identity
 * columns (Name / Email / phone) are never re-displayed.
 *
 * COLUMN NAMES have spaces/dots/slash and are double-quoted from the pinned maps (never built by
 * string concatenation — larangan). `quoteCols` wraps whole names; it does not assemble names.
 */

/** Double-quote whole physical column names taken from the pinned maps for a PostgREST select. */
function quoteCols(cols: readonly string[]): string {
  return cols.map((c) => `"${c}"`).join(",");
}
/** Double-quote one physical column name for a filter position. */
function q(col: string): string {
  return `"${col}"`;
}

const PAGE = 1000; // PostgREST page size for the DOB parse-stats read (dobStats)

/** COUNT(*) with an optional filter. head:true → count only, no rows transferred. */
async function count(
  admin: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine?: (query: any) => any,
): Promise<number> {
  let query = admin.from(STAGING_TABLE).select("*", { count: "exact", head: true });
  if (refine) query = refine(query);
  const { count: c, error } = await query;
  if (error) throw error;
  return c ?? 0;
}

// ── Segment resolvers (TUGAS 4 / Sprint 4A) ─────────────────────────────────────────────────
//
// These call the migration-14 RPC crm_staging_segment_ids, which does the staging↔master
// semi-join server-side in ONE round trip (~0.33s warm). The old two-phase paging approach
// (page ~82k staging emails, then chunk-match to master via .in()) was ~330 sequential PostgREST
// requests = tens of seconds for a big criterion — a hard blocker for export (Sprint 4A TUGAS 1).
// The RPC returns exactly the same customer_id set (verified: New User 74,021, Fitco 67,653).

/** Read a full page-set of customer_ids from the migration-14 RPC into a Set. */
async function rpcSegmentIds(
  admin: SupabaseClient,
  args: { p_rfm?: string | null; p_program_column?: string | null },
): Promise<Set<string>> {
  const { data, error } = await admin.rpc("crm_staging_segment_ids", {
    p_rfm: args.p_rfm ?? null,
    p_program_column: args.p_program_column ?? null,
  });
  if (error) throw error;
  const out = new Set<string>();
  for (const r of (data ?? []) as { customer_id: string }[]) if (r.customer_id) out.add(r.customer_id);
  return out;
}

/** Master customer_ids whose staging row has RFM = `value` (closed list). AND-only in segments. */
export async function resolveStagingRfmCustomerIds(
  admin: SupabaseClient,
  value: string,
): Promise<Set<string>> {
  if (!isRfmValue(value)) return new Set();
  return rpcSegmentIds(admin, { p_rfm: value });
}

/** Master customer_ids who participate in program `key` (value present and not `-`). CLINICAL
 *  programs are gated on profile.view_health at the route, not here. The physical column name is
 *  resolved from the CLOSED registry; the RPC re-validates it against its own allowlist. */
export async function resolveStagingProgramCustomerIds(
  admin: SupabaseClient,
  key: string,
): Promise<Set<string>> {
  const def = programByKey(key);
  if (!def) return new Set();
  return rpcSegmentIds(admin, { p_program_column: def.column });
}

// ── Per-profile completion (TUGAS 4, profile detail) ────────────────────────────────────────

export interface ProfileImportProgram {
  key: string;
  label: string;
  /** The stored label value (e.g. "Fitco User", "Padel rebel") — shown verbatim. */
  value: string;
}

export interface ProfileImport {
  /** false when the profile has no email to match on. */
  matchable: boolean;
  /** false when no staging row matched this profile's email. */
  matched: boolean;
  city: string | null;
  /** Parsed birth date + flags (ambiguity / plausibility). Provenance = staging import. */
  dob: DobParse | null;
  /** Age computed FROM the parsed date as of the request (never taken from the Umur column). */
  age: number | null;
  /** The stale Umur snapshot value, echoed ONLY as a cross-check cue (labelled 20 Apr 2026). */
  umurSnapshot: string | null;
  rfmPaidOrder: string | null;
  programs: ProfileImportProgram[];
  /** True when clinic-patient program flags were withheld because the caller lacks view_health. */
  clinicalWithheld: boolean;
}

const NO_EMAIL: ProfileImport = {
  matchable: false, matched: false, city: null, dob: null, age: null,
  umurSnapshot: null, rfmPaidOrder: null, programs: [], clinicalWithheld: false,
};

export async function fetchProfileImport(
  admin: SupabaseClient,
  customerId: string,
  opts: { canViewHealth: boolean; today?: Date },
): Promise<ProfileImport> {
  const today = opts.today ?? new Date();

  // Profile email, server-side only — used to match, never returned from this layer.
  const { data: prof, error: profErr } = await admin
    .from("master_customer")
    .select("email_normalized")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (profErr) throw profErr;
  const email = normalizeEmail((prof as { email_normalized: string | null } | null)?.email_normalized ?? null);
  if (!email) return NO_EMAIL;

  // Which program columns to read: clinical ones only for a view_health caller (server-side
  // omission, not client masking — being a clinic patient infers health status).
  const visiblePrograms: ProgramDef[] = STAGING_PROGRAMS.filter((p) => opts.canViewHealth || !p.clinical);
  const clinicalWithheld = !opts.canViewHealth && STAGING_PROGRAMS.some((p) => p.clinical);

  const selectCols = quoteCols([
    STAGING_COLUMNS.city,
    STAGING_COLUMNS.dob,
    STAGING_COLUMNS.umur,
    STAGING_COLUMNS.rfmPaidOrder,
    ...visiblePrograms.map((p) => p.column),
  ]);

  const { data, error } = await admin
    .from(STAGING_TABLE)
    .select(selectCols)
    .ilike(q(STAGING_COLUMNS.email), email)
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row) return { ...NO_EMAIL, matchable: true };

  const dobRaw = (row[STAGING_COLUMNS.dob] as string | null) ?? null;
  const dob = parseStagingDob(dobRaw, today);
  const age = dob.status === "parsed" ? ageFromIso(dob.iso, today) : null;

  const programs: ProfileImportProgram[] = [];
  for (const p of visiblePrograms) {
    const v = row[p.column] as string | null;
    if (isParticipation(v)) programs.push({ key: p.key, label: p.label, value: (v as string).trim() });
  }

  return {
    matchable: true,
    matched: true,
    city: (row[STAGING_COLUMNS.city] as string | null) ?? null,
    dob,
    age,
    umurSnapshot: (row[STAGING_COLUMNS.umur] as string | null) ?? null,
    rfmPaidOrder: (row[STAGING_COLUMNS.rfmPaidOrder] as string | null) ?? null,
    programs,
    clinicalWithheld,
  };
}

// ── Coverage + parse stats (TUGAS 4, /quality) ──────────────────────────────────────────────

/** The import snapshot date as a UTC Date — used ONLY to cross-check the birth YEAR against the
 *  Umur column (Umur is a snapshot, not a live signal — K-19). */
const SNAPSHOT_DATE = new Date(`${STAGING_UMUR_SNAPSHOT}T00:00:00Z`);

/** Read every filled DOB (+ its Umur) and compute parse + year-cross-check stats in JS — PostgREST
 *  cannot parse text dates, do date arithmetic, or compare columns, so this is the only honest
 *  way to get these numbers, and it is why they are computed live from a paged read. */
async function dobStats(admin: SupabaseClient, today: Date) {
  let parsed = 0, unparseable = 0, ambiguous = 0, swapped = 0, implausible = 0;
  let umurChecked = 0, umurYearExact = 0, umurOffByOne = 0, umurConflict = 0;

  for (let from = 0; ; from += PAGE) {
    // Order by DOB then Umur for deterministic pagination (no exposed PK). Counts over the parse
    // outcomes are stable across pages; exact headline figures live in dated VERIFIED_ARTIFACTS.
    const { data, error } = await admin
      .from(STAGING_TABLE)
      .select(quoteCols([STAGING_COLUMNS.dob, STAGING_COLUMNS.umur]))
      .not(q(STAGING_COLUMNS.dob), "is", null)
      .order(q(STAGING_COLUMNS.dob), { ascending: true })
      .order(q(STAGING_COLUMNS.umur), { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of batch) {
      const p = parseStagingDob(r[STAGING_COLUMNS.dob] as string | null, today);
      if (p.status === "empty") continue;
      if (p.status === "unparseable") { unparseable++; continue; }
      parsed++;
      if (p.ambiguousDayMonth) ambiguous++;
      if (p.swapped) swapped++;
      if (p.plausibility && p.plausibility !== "ok") implausible++;

      // Year cross-check against Umur, computed as-of the import snapshot (not today) so that
      // stale-snapshot drift is not mistaken for error. Day/month swaps do NOT change the year,
      // so this validates the year only.
      const umurRaw = (r[STAGING_COLUMNS.umur] as string | null)?.trim();
      if (umurRaw && /^\d+$/.test(umurRaw)) {
        const ageAtSnapshot = ageFromIso(p.iso, SNAPSHOT_DATE);
        if (ageAtSnapshot != null) {
          umurChecked++;
          const diff = Math.abs(ageAtSnapshot - parseInt(umurRaw, 10));
          if (diff === 0) umurYearExact++;
          else if (diff === 1) umurOffByOne++;
          else umurConflict++;
        }
      }
    }
    if (batch.length < PAGE) break;
  }
  return { parsed, unparseable, ambiguous, swapped, implausible, umurChecked, umurYearExact, umurOffByOne, umurConflict };
}

export async function fetchStagingImportCoverage(
  admin: SupabaseClient,
  today: Date = new Date(),
): Promise<StagingImportCoverage> {
  const [rowsTotal, withEmail, withDob, stats, rfm, programs] = await Promise.all([
    count(admin),
    count(admin, (query) => query.not(q(STAGING_COLUMNS.email), "is", null)),
    count(admin, (query) => query.not(q(STAGING_COLUMNS.dob), "is", null)),
    dobStats(admin, today),
    // RFM spread — the four buckets plus the "-" absence bucket (shown for honesty, K-08).
    Promise.all(
      [...STAGING_RFM_VALUES, "-"].map(async (value) => ({
        value,
        count: await count(admin, (query) => query.eq(q(STAGING_COLUMNS.rfmPaidOrder), value)),
      })),
    ),
    // Every program column's participation count (value present and not "-"). Zeros kept (K-08).
    Promise.all(
      STAGING_PROGRAMS.map(async (p) => ({
        key: p.key,
        label: p.label,
        clinical: p.clinical,
        count: await count(admin, (query) => query.not(q(p.column), "is", null).neq(q(p.column), "-")),
      })),
    ),
  ]);

  return {
    rowsTotal,
    withEmail,
    withDob,
    dobParsed: stats.parsed,
    dobUnparseable: stats.unparseable,
    dobAmbiguousDayMonth: stats.ambiguous,
    dobSwapped: stats.swapped,
    dobImplausible: stats.implausible,
    umurChecked: stats.umurChecked,
    umurYearExact: stats.umurYearExact,
    umurOffByOne: stats.umurOffByOne,
    umurConflict: stats.umurConflict,
    rfm,
    programs,
  };
}

// ── Light dashboard summary (TUGAS 4, dashboard cards) ──────────────────────────────────────

export interface StagingDashboard {
  /** staging rows carrying a birth date (master_customer has 0). */
  importDob: number;
  /** RFM spread incl the "-" absence bucket. */
  importRfm: { value: string; count: number }[];
}

export async function fetchStagingDashboard(admin: SupabaseClient): Promise<StagingDashboard> {
  const [importDob, importRfm] = await Promise.all([
    count(admin, (query) => query.not(q(STAGING_COLUMNS.dob), "is", null)),
    Promise.all(
      [...STAGING_RFM_VALUES, "-"].map(async (value) => ({
        value,
        count: await count(admin, (query) => query.eq(q(STAGING_COLUMNS.rfmPaidOrder), value)),
      })),
    ),
  ]);
  return { importDob, importRfm };
}
