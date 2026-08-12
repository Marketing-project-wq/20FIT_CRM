/**
 * Constants + PURE helpers for multi-source profile completion (TUGAS 3). Client-safe: the
 * profile UI imports the source registry + the match-key helpers. The service-role query code
 * is in lib/crm/multisource.ts (server-only). Same split as enrichment-constants.ts (3R).
 *
 * SCOPE OF THIS SLICE: the arena / gym BOOKING + ORDER sources, matched by NORMALISED EMAIL
 * first, then NORMALISED PHONE as a fallback (K-06) — never by name (a wrong name-match glues
 * one person's history to another's profile; invisible until someone is wrongly contacted).
 * The key that produced a match is RECORDED so the confidence is visible on screen.
 *
 * NOT in this slice (documented remaining — docs/RENCANA-multisumber.md): the clinic_* chain
 * via patient_id (health data behind profile.view_health), /quality coverage, and segment
 * filters. Kept separate on purpose — clinic carries NIK / DOB / address / emergency contacts
 * and must not be rushed.
 *
 * ZERO write path, ZERO copy into master_customer / crm_*. Read + join at display time. The
 * safe-column lists below are the ONLY columns read; a guard test (multisource.test.ts)
 * enforces that no forbidden column (free-text notes, raw identity, payment proof) is listed.
 */

export type MatchKey = "email" | "phone";

export interface MultiSourceDef {
  /** Stable id for the UI + registry lookups. */
  key: string;
  /** Human label shown on the profile. */
  label: string;
  table: string;
  emailColumn: string;
  /** null → email-only source (no usable phone column). */
  phoneColumn: string | null;
  /** The ONLY columns read from this source. All non-sensitive, non-free-text, factual. */
  safeColumns: readonly string[];
  /** Column used as the short human summary of a row (e.g. a booking code). */
  labelColumn: string;
  /** Optional status column for a one-line summary. */
  statusColumn: string | null;
}

/**
 * Columns that must NEVER appear in a safeColumns list — free-text (may hold private notes),
 * raw contact identity (already matched on; re-displaying is redundant + a mini contact
 * export), payment proof (can carry personal/financial detail), and anything sensitive. The
 * guard test asserts every safeColumns list is disjoint from this set.
 */
export const MULTISOURCE_FORBIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  "notes",
  "email",
  "phone",
  "payment_proof_url",
  "payment_proof_notes",
  "payment_proof_by",
  "payment_ref",
  "payment_reference",
  // clinic sensitive (belongs to the deferred clinic chain, never here):
  "id_number",
  "date_of_birth",
  "address",
  "occupation",
  "emergency_contact_name",
  "emergency_contact_phone",
]);

/** The arena / gym sources for this slice. Columns verified against the live schema 12 Aug 2026. */
export const MULTISOURCE_DEFS: readonly MultiSourceDef[] = [
  {
    key: "arena_class",
    label: "Arena — kelas",
    table: "arena_class_bookings",
    emailColumn: "email",
    phoneColumn: "phone",
    safeColumns: ["booking_code", "status", "price", "created_at"],
    labelColumn: "booking_code",
    statusColumn: "status",
  },
  {
    key: "arena_booking",
    label: "Arena — booking venue",
    table: "arena_bookings",
    emailColumn: "email",
    phoneColumn: "phone",
    safeColumns: ["booking_code", "booking_date", "start_time", "status", "price"],
    labelColumn: "booking_code",
    statusColumn: "status",
  },
  {
    key: "arena_package",
    label: "Arena — paket",
    table: "arena_package_orders",
    emailColumn: "email",
    phoneColumn: "phone",
    safeColumns: ["order_code", "package_name", "sessions", "status"],
    labelColumn: "order_code",
    statusColumn: "status",
  },
  {
    key: "arena_member",
    label: "Arena — member",
    table: "arena_members",
    emailColumn: "email",
    phoneColumn: "phone",
    safeColumns: ["member_code", "is_active"],
    labelColumn: "member_code",
    statusColumn: null,
  },
  {
    key: "gym_class",
    label: "Gym — kelas",
    table: "gym_class_bookings",
    emailColumn: "email",
    phoneColumn: "phone",
    safeColumns: ["booking_code", "status", "price"],
    labelColumn: "booking_code",
    statusColumn: "status",
  },
  {
    key: "gym_membership",
    label: "Gym — membership",
    table: "gym_membership_orders",
    emailColumn: "email",
    phoneColumn: "phone",
    safeColumns: ["order_code", "plan_name", "duration_months", "status"],
    labelColumn: "order_code",
    statusColumn: "status",
  },
] as const;

/**
 * Raw phone variants to try when matching a normalised `62…` phone against source tables whose
 * phone column is NOT normalised (they store `0812…`, `+62…`, bare national, etc.). PostgREST
 * cannot normalise inside a filter, so we generate the common formats from the canonical form
 * and match with `.in()`. Best-effort by design (lower confidence than email) — the key used
 * is recorded so that shows on screen. Input MUST already be normalizePhoneID output (`62…`).
 */
export function phoneMatchCandidates(normalized62: string | null): string[] {
  if (!normalized62 || !/^62\d+$/.test(normalized62)) return [];
  const nsn = normalized62.slice(2); // national significant number, no country code
  return Array.from(new Set([
    normalized62, // 62…
    `+${normalized62}`, // +62…
    `0${nsn}`, // 0…
    nsn, // bare national
  ])).filter((v) => v.length > 0);
}

/** Which match keys to try, in order: email first, phone as fallback. Skips a key the profile
 *  has no value for. Pure so the ordering is locked by a test. */
export function matchKeyOrder(email: string | null, phone: string | null): MatchKey[] {
  const out: MatchKey[] = [];
  if (email) out.push("email");
  if (phone) out.push("phone");
  return out;
}
