import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./normalize";
import {
  HYROX_SAFE_COLUMNS,
  HYROX_SENSITIVE_COLUMNS,
  MY20FIT_PROFILE_SAFE_COLUMNS,
  MY20FIT_ACTIVITY_SAFE_COLUMNS,
} from "./enrichment-constants";
import { parseNik, type NikDerived } from "./nik";
import type { EnrichmentSourceCoverage } from "./quality-types";

/**
 * Profile enrichment from unmatched ecosystem sources (Sprint 3R). READ-ONLY, server-only,
 * service-role client passed in by the route. Matched to a profile by NORMALISED EMAIL
 * (normalize.ts, K-06) — never raw string, never name. `rc_team_members` (name-only key) is
 * intentionally NOT read here.
 *
 * ZERO write to master_customer / crm_*. The profile's real email is read server-side ONLY
 * (by customer_id) to compute the match; it never leaves this layer.
 *
 * Sprint 3S: sensitive Hyrox fields (NIK/DOB/blood/emergency) are returned UNMASKED to a
 * profile.view_health caller (CS staff need them at a glance) and OMITTED entirely for any
 * other role (K-02 — the value never reaches the browser). The gate is the RBAC role, not a
 * per-field toggle. From the NIK we also DERIVE gender / birth date / issuance province
 * (lib/crm/nik.ts) — three fields that are 0% filled in master_customer — computed at display
 * time, never written.
 */

export interface HyroxParticipation {
  eventName: string | null;
  kategori: string | null;
  namaTim: string | null;
  posisi: string | null;
  registeredAt: string | null; // a REAL event date
}

export interface HyroxSensitive {
  nik: string | null;
  tglLahir: string | null;
  golDarah: string | null;
  kontakDarurat: string | null;
  noKontakDarurat: string | null;
}

export interface ProfileEnrichment {
  /** null when the profile has no email to match on. */
  matchable: boolean;
  hyrox: {
    matched: boolean;
    rows: HyroxParticipation[];
    /** Whether any sensitive Hyrox field exists for this profile (presence, not value). */
    hasSensitive: boolean;
    /** Present (UNMASKED) ONLY for a profile.view_health caller; null for any other role. */
    sensitive: HyroxSensitive | null;
    /** Fields derived from the NIK (gender/DOB/province) — present with `sensitive`. */
    nikDerived: NikDerived | null;
  };
  my20fit: {
    matched: boolean;
    isPlusMember: boolean | null;
    onboardingCompleted: boolean | null;
    createdAt: string | null;
  };
  activity: {
    matched: boolean;
    firstSeenAt: string | null;
    lastActiveAt: string | null; // the only REAL recency in the ecosystem
    pingCount: number | null;
  };
}

/** Case-insensitive exact match on an email column (no wildcards in the value). */
function eqEmail(q: any, col: string, email: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return q.ilike(col, email);
}

export async function fetchProfileEnrichment(
  admin: SupabaseClient,
  customerId: string,
  opts: { canViewHealth: boolean },
): Promise<ProfileEnrichment> {
  const empty: ProfileEnrichment = {
    matchable: false,
    hyrox: { matched: false, rows: [], hasSensitive: false, sensitive: null, nikDerived: null },
    my20fit: { matched: false, isPlusMember: null, onboardingCompleted: null, createdAt: null },
    activity: { matched: false, firstSeenAt: null, lastActiveAt: null, pingCount: null },
  };

  // Real email, server-side only — never returned to the client.
  const { data: prof, error: profErr } = await admin
    .from("master_customer")
    .select("email_normalized")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (profErr) throw profErr;
  const email = normalizeEmail((prof as { email_normalized: string | null } | null)?.email_normalized);
  if (!email) return empty;

  // Hyrox — safe fields always; sensitive only for a permitted caller.
  const sensCols = opts.canViewHealth ? `,${HYROX_SENSITIVE_COLUMNS.join(",")}` : "";
  const { data: hyData, error: hyErr } = await eqEmail(
    admin.from("cf_hyrox_participants").select(`${HYROX_SAFE_COLUMNS.join(",")}${sensCols}`),
    "email",
    email,
  );
  if (hyErr) throw hyErr;
  const hyRows = (hyData ?? []) as Record<string, unknown>[];

  const rows: HyroxParticipation[] = hyRows.map((r) => ({
    eventName: (r.event_name as string) ?? null,
    kategori: (r.kategori as string) ?? null,
    namaTim: (r.nama_tim as string) ?? null,
    posisi: (r.posisi as string) ?? null,
    registeredAt: (r.registered_at as string) ?? null,
  }));

  // Collapse sensitive fields across rows (first non-null wins). Returned UNMASKED for a
  // view_health caller; entirely null (never sent) for any other role.
  let hasSensitive = false;
  let sensitive: HyroxSensitive | null = null;
  let nikDerived: NikDerived | null = null;
  if (opts.canViewHealth && hyRows.length > 0) {
    const pick = (k: string) => {
      for (const r of hyRows) {
        const v = r[k];
        if (v != null && String(v).trim() !== "") return String(v);
      }
      return null;
    };
    const raw = {
      nik: pick("nik"),
      tglLahir: pick("tgl_lahir"),
      golDarah: pick("gol_darah"),
      kontakDarurat: pick("kontak_darurat"),
      noKontakDarurat: pick("no_kontak_darurat"),
    };
    hasSensitive = Object.values(raw).some((v) => v != null);
    sensitive = raw;
    nikDerived = raw.nik ? parseNik(raw.nik) : null;
  }

  // my20fit_profile — presence + membership only (no health/body/cycle).
  const { data: mpData, error: mpErr } = await eqEmail(
    admin.from("my20fit_profile").select(MY20FIT_PROFILE_SAFE_COLUMNS.join(",")).limit(1),
    "email",
    email,
  );
  if (mpErr) throw mpErr;
  const mp = (mpData ?? [])[0] as Record<string, unknown> | undefined;

  // my20fit_user_activity — real recency.
  const { data: uaData, error: uaErr } = await eqEmail(
    admin.from("my20fit_user_activity").select(MY20FIT_ACTIVITY_SAFE_COLUMNS.join(",")).limit(1),
    "email",
    email,
  );
  if (uaErr) throw uaErr;
  const ua = (uaData ?? [])[0] as Record<string, unknown> | undefined;

  return {
    matchable: true,
    hyrox: { matched: rows.length > 0, rows, hasSensitive, sensitive, nikDerived },
    my20fit: {
      matched: mp != null,
      isPlusMember: (mp?.is_plus_member as boolean) ?? null,
      onboardingCompleted: (mp?.onboarding_completed as boolean) ?? null,
      createdAt: (mp?.created_at as string) ?? null,
    },
    activity: {
      matched: ua != null,
      firstSeenAt: (ua?.first_seen_at as string) ?? null,
      lastActiveAt: (ua?.last_active_at as string) ?? null,
      pingCount: (ua?.ping_count as number) ?? null,
    },
  };
}

// ── FILTER SUPPORT (T3): resolve which master customer_ids match a source, by email ──────

export type EnrichmentSource = "hyrox" | "my20fit" | "recency";

const SOURCE_TABLE: Record<EnrichmentSource, string> = {
  hyrox: "cf_hyrox_participants",
  my20fit: "my20fit_profile",
  recency: "my20fit_user_activity",
};

const PAGE = 1000;
const CEILING = 200_000;

/**
 * The set of master customer_ids whose normalised email appears in the given source. Reads
 * distinct source emails (small tables), normalises them (K-06), then finds master_customer
 * rows with a matching email_normalized. Returns customer_ids only (uuid — opaque). Relies on
 * master_customer.email_normalized already being normalised (verified: the match counts here
 * equal the SQL lower(trim()) join — 152/169/44 on 11 Agu 2026).
 */
export async function resolveEnrichmentCustomerIds(
  admin: SupabaseClient,
  source: EnrichmentSource,
): Promise<Set<string>> {
  // 1. distinct normalised source emails
  const emails = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(SOURCE_TABLE[source])
      .select("email")
      .not("email", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as { email: string | null }[];
    for (const r of batch) {
      const e = normalizeEmail(r.email);
      if (e) emails.add(e);
    }
    if (batch.length < PAGE) break;
    if (emails.size > CEILING) throw new Error("enrichment email set exceeded ceiling");
  }
  if (emails.size === 0) return new Set();

  // 2. master customer_ids whose email_normalized is in that set (chunked .in()).
  const ids = new Set<string>();
  const emailList = Array.from(emails);
  const CHUNK = 300;
  for (let i = 0; i < emailList.length; i += CHUNK) {
    const chunk = emailList.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id")
      .in("email_normalized", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as { customer_id: string }[]) ids.add(r.customer_id);
  }
  return ids;
}

// ── QUALITY SUPPORT (T4): live source coverage for /quality ───────────────────────────

/**
 * Coverage of each unmatched source: raw source rows (live head:true count) and how many
 * distinct master profiles it reaches by normalised email. Parameter-free → not audited
 * (K-07). rc_team_members is excluded (name-only key). Low coverage is a data-quality
 * finding, not an implementation detail.
 */
export async function fetchEnrichmentCoverage(admin: SupabaseClient): Promise<EnrichmentSourceCoverage[]> {
  const rowCount = async (table: string): Promise<number> => {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  };
  const [hyRows, mpRows, uaRows, hyIds, mpIds, uaIds] = await Promise.all([
    rowCount("cf_hyrox_participants"),
    rowCount("my20fit_profile"),
    rowCount("my20fit_user_activity"),
    resolveEnrichmentCustomerIds(admin, "hyrox"),
    resolveEnrichmentCustomerIds(admin, "my20fit"),
    resolveEnrichmentCustomerIds(admin, "recency"),
  ]);
  return [
    { key: "hyrox", label: "Peserta Hyrox (cf_hyrox_participants)", sourceRows: hyRows, matchedProfiles: hyIds.size },
    { key: "my20fit", label: "Pengguna my20fit (my20fit_profile)", sourceRows: mpRows, matchedProfiles: mpIds.size },
    { key: "recency", label: "Aktivitas nyata (my20fit_user_activity)", sourceRows: uaRows, matchedProfiles: uaIds.size },
  ];
}
