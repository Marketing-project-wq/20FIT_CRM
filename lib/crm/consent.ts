import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskPhone, maskEmail } from "./mask";

/**
 * Consent + suppression register read layer — READ-ONLY. Server-only; the service-role
 * client is passed in by the route handler (crm_consent and crm_suppression have RLS ON
 * with zero policy, so the anon key cannot and must not read them). No write path: this
 * sprint is read-only by design (write path deferred — see docs/RENCANA-jalur-tulis-consent.md).
 *
 * suppression.identity_key is a normalized plaintext phone/email (PII). It is masked
 * here when the caller lacks full-contact view, exactly like the audience list.
 */

export const CONSENT_PAGE_SIZE = 25;

export interface ConsentRow {
  id: string;
  customer_id: string | null;
  channel: string;
  purpose: string;
  basis: string;
  status: string;
  source: string | null;
  recorded_at: string | null;
  updated_at: string | null;
}

export interface SuppressionRow {
  id: string;
  identity_kind: string;
  identity_key: string | null; // masked when `masked`
  reason_code: string;
  reason_detail: string | null;
  status: string;
  created_at: string | null;
}

/**
 * How many consent rows sit under each legal basis (T-60). Until 7 Sep 2026 this was not worth
 * asking: all 408,119 rows were `legacy_import_unverified`, from one source, so the screen could
 * describe the whole table in one sentence. The CSV import writes `explicit_opt_in`, which makes
 * this the first time the table holds two bases — and the banner that described the table as a
 * single legacy backfill would have gone on saying so, including the line about deleting the rows
 * to undo it cleanly. That line is safe about a backfill and destructive about opt-in evidence.
 *
 * `other` exists so an unrecognised basis cannot hide inside a total: it is total minus the known
 * two, and the screen says so out loud rather than silently under-reporting.
 */
export interface BasisCounts {
  legacy: number;
  explicitOptIn: number;
  other: number;
}

export interface ConsentScreen {
  consent: { rows: ConsentRow[]; total: number; page: number; pageSize: number };
  basisCounts: BasisCounts;
  suppression: { rows: SuppressionRow[]; total: number; page: number; pageSize: number };
}

function maskIdentity(kind: string, key: string | null): string | null {
  if (key == null) return null;
  return kind === "email" ? maskEmail(key) : maskPhone(key);
}

export async function fetchConsentScreen(
  admin: SupabaseClient,
  opts: { consentPage: number; suppressionPage: number; pageSize: number },
  masked: boolean,
): Promise<ConsentScreen> {
  const pageSize = opts.pageSize;
  const cPage = opts.consentPage >= 1 ? Math.floor(opts.consentPage) : 1;
  const sPage = opts.suppressionPage >= 1 ? Math.floor(opts.suppressionPage) : 1;

  const cFrom = (cPage - 1) * pageSize;
  const sFrom = (sPage - 1) * pageSize;

  const consentQ = admin
    .from("crm_consent")
    .select("id, customer_id, channel, purpose, basis, status, source, recorded_at, updated_at", {
      count: "exact",
    })
    .order("recorded_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(cFrom, cFrom + pageSize - 1);

  const suppQ = admin
    .from("crm_suppression")
    .select("id, identity_kind, identity_key, reason_code, reason_detail, status, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(sFrom, sFrom + pageSize - 1);

  // Two head counts over the CLOSED basis vocabulary — no rows transferred. Cheap enough to run
  // on every open of the archive, and it must be live: the whole point is that the screen stops
  // describing the table from memory.
  const legacyQ = admin
    .from("crm_consent")
    .select("*", { count: "exact", head: true })
    .eq("basis", "legacy_import_unverified");
  const optinQ = admin
    .from("crm_consent")
    .select("*", { count: "exact", head: true })
    .eq("basis", "explicit_opt_in");

  const [consentRes, suppRes, legacyRes, optinRes] = await Promise.all([
    consentQ,
    suppQ,
    legacyQ,
    optinQ,
  ]);
  if (consentRes.error) throw consentRes.error;
  if (suppRes.error) throw suppRes.error;
  if (legacyRes.error) throw legacyRes.error;
  if (optinRes.error) throw optinRes.error;

  const legacy = legacyRes.count ?? 0;
  const explicitOptIn = optinRes.count ?? 0;
  const consentTotal = consentRes.count ?? 0;
  const basisCounts = {
    legacy,
    explicitOptIn,
    // Never negative: a total that is somehow smaller than the parts is a measurement problem, not
    // a negative population, and showing "-3 rows" would be its own small lie.
    other: Math.max(0, consentTotal - legacy - explicitOptIn),
  };

  const suppression = ((suppRes.data ?? []) as SuppressionRow[]).map((r) => ({
    ...r,
    identity_key: masked ? maskIdentity(r.identity_kind, r.identity_key) : r.identity_key,
  }));

  return {
    consent: {
      rows: (consentRes.data ?? []) as ConsentRow[],
      total: consentTotal,
      page: cPage,
      pageSize,
    },
    basisCounts,
    suppression: {
      rows: suppression,
      total: suppRes.count ?? 0,
      page: sPage,
      pageSize,
    },
  };
}
