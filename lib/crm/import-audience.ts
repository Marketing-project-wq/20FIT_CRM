import { normalizeEmail, normalizePhoneID } from "./normalize";

/**
 * PURE planning core for the CSV audience import (Fase 1). No I/O, no DB, no writes — it takes the
 * parsed rows plus the sets of keys that already exist / are suppressed, and decides, per row, what
 * WOULD happen. The route uses this for the dry-run summary AND to build the exact list it later
 * commits; because it is pure it CANNOT write, which is half of why the dry-run is safe (the other
 * half — the route never calling the writer in dry-run mode — is proven in import-audience-run.test).
 *
 * Compliance shape (product-owner decisions, 2026-09-02):
 *  - Rows are DIRECTLY CONTACTABLE (K-36: consent is not a gate; unsubscribe/suppression is). The
 *    import just moves data whose consent was given at the collection point. The mandatory
 *    "collection source" is stored as EVIDENCE (in crm_consent), not as a gate.
 *  - Dedup is EMAIL-PRIMARY, SKIP-ONLY (K-55): an EMAIL match with an existing person is skipped; a
 *    phone-only match is INSERTED and flagged (a shared number must not drop a distinct person), with
 *    the colliding phone nulled at write. Never merged, never overwritten. Master stays authoritative.
 *  - Suppression is untouched and still wins: a NET-NEW person whose identity is suppressed is still
 *    imported (they are a real new person) but is counted separately so the operator sees how many of
 *    the imported rows will never receive a send.
 */

/** Hard cap for Fase 1 — small on purpose to shrink the blast radius of a first write-to-production
 *  path. Raise after it's proven in real use. One constant, referenced everywhere. */
export const MAX_IMPORT_ROWS = 20_000;

/** Safe columns only (Fase 0 honored, same class as the activity ingest). DOB / gender / NIK / health
 *  are deliberately NOT importable here — they need their own legal basis. */
export const IMPORT_TARGET_FIELDS = ["full_name", "email", "phone", "city", "ignore"] as const;
export type ImportField = (typeof IMPORT_TARGET_FIELDS)[number];

/** Maps a CSV header (verbatim) to the destination field it fills, or "ignore". */
export type ColumnMapping = Record<string, ImportField>;

/** Header-name heuristics for the auto-guess. Operator can always override in the UI. */
const GUESS: { field: Exclude<ImportField, "ignore">; re: RegExp }[] = [
  { field: "email", re: /\b(e-?mail|surel|alamat\s*e-?mail)\b/i },
  { field: "phone", re: /\b(phone|telp|telepon|hp|no\.?\s*hp|nomor|whatsapp|wa|mobile)\b/i },
  { field: "full_name", re: /\b(full[_\s]*name|nama\s*lengkap|nama|name)\b/i },
  { field: "city", re: /\b(city|kota|domisili)\b/i },
];

/** Best-effort header→field guess. First matching pattern wins; each field is used at most once
 *  (the first header that matches it), the rest default to "ignore". */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ImportField>();
  for (const h of headers) {
    const hit = GUESS.find((g) => g.re.test(h) && !used.has(g.field));
    if (hit) {
      mapping[h] = hit.field;
      used.add(hit.field);
    } else {
      mapping[h] = "ignore";
    }
  }
  return mapping;
}

export interface NormalizedRow {
  fullName: string | null;
  email: string | null; // raw (as typed) — stored in master_customer.email
  emailNormalized: string | null; // canonical, for dedup + suppression match
  phoneNormalized: string | null; // canonical 62… (no +), for dedup + suppression match
  city: string | null;
}

/** Apply a mapping to one raw CSV record and normalize the contact identities through the ONE canon
 *  (normalize.ts) so dedup and suppression match exactly what the DB stores. */
export function normalizeMappedRow(raw: Record<string, string>, mapping: ColumnMapping): NormalizedRow {
  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let city: string | null = null;
  for (const [header, field] of Object.entries(mapping)) {
    const v = (raw[header] ?? "").trim();
    if (v === "") continue;
    if (field === "full_name") fullName = v;
    else if (field === "email") email = v;
    else if (field === "phone") phone = v;
    else if (field === "city") city = v;
  }
  return {
    fullName: fullName || null,
    email: email || null,
    emailNormalized: normalizeEmail(email),
    phoneNormalized: normalizePhoneID(phone),
    city: city || null,
  };
}

export type RowStatus =
  | "insert"
  | "insert_suppressed" // will be inserted, but is suppressed → will never receive a send
  | "insert_shared_phone" // NEW email, but the phone matches an existing contact — INSERTED (email is the
  //                         identity key) and flagged; the shared phone is nulled at write (master's phone
  //                         is unique), so a distinct person is never dropped just for sharing a number.
  | "skip_duplicate_email" // email matches a person already in master → skipped (identity is unambiguous)
  | "skip_duplicate_in_batch" // same email appeared earlier in this file
  | "skip_invalid"; // no usable email (email is required in Fase 1)

export interface RowOutcome {
  index: number; // 0-based row index within the data rows
  status: RowStatus;
  email: string | null;
}

export interface ImportSummary {
  read: number; // total data rows read
  validEmail: number; // rows with a usable (normalizable) email
  duplicatesEmail: number; // skipped: email matches an existing person (dedup is email-primary)
  duplicatesInBatch: number;
  invalid: number; // no valid email
  sharedPhone: number; // INSERTED, but the phone matches an existing contact (shared number) — surfaced
  //                      as its own figure so the operator sees it before confirming, not hidden.
  suppressed: number; // net-new rows that are suppressed (inserted, but will never receive)
  netInsert: number; // total rows that will be inserted (INCLUDING suppressed and shared-phone)
  netContactable: number; // netInsert − suppressed (the count that can actually be sent to)
}

export interface ImportPlan {
  summary: ImportSummary;
  insertRows: NormalizedRow[]; // exactly the rows to hand to the ingest function
  outcomes: RowOutcome[]; // per-row disposition, for the post-run report
}

export interface ImportKeys {
  existingEmails: ReadonlySet<string>; // normalized emails already in master_customer
  existingPhones: ReadonlySet<string>; // normalized phones already in master_customer
  suppressedEmails: ReadonlySet<string>; // active-suppression email identities (normalized)
  suppressedPhones: ReadonlySet<string>; // active-suppression phone identities (normalized)
}

/** The whole plan, pure. `rows` are the raw parsed CSV records; `keys` are the DB facts the route
 *  loaded. Returns the summary + the exact insert list + per-row outcomes. Writes nothing. */
export function planImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  keys: ImportKeys,
): ImportPlan {
  const outcomes: RowOutcome[] = [];
  const insertRows: NormalizedRow[] = [];
  const seenEmails = new Set<string>(); // emails already accepted from THIS file
  const s: ImportSummary = {
    read: rows.length,
    validEmail: 0,
    duplicatesEmail: 0,
    duplicatesInBatch: 0,
    invalid: 0,
    sharedPhone: 0,
    suppressed: 0,
    netInsert: 0,
    netContactable: 0,
  };

  rows.forEach((raw, index) => {
    const n = normalizeMappedRow(raw, mapping);
    const email = n.emailNormalized;

    if (email === null) {
      s.invalid++;
      outcomes.push({ index, status: "skip_invalid", email: null });
      return;
    }
    s.validEmail++;

    // Dedup is EMAIL-PRIMARY (K-55): email is a personal identity, so an email match is an unambiguous
    // duplicate → skip. A phone is a SHARED identifier (household, a parent registering children, an
    // office line), so a phone-only match must NOT drop a distinct person — it is inserted and flagged
    // instead. Suppression stays keyed on both (below); being in the pool never means being contactable.
    if (keys.existingEmails.has(email)) {
      s.duplicatesEmail++;
      outcomes.push({ index, status: "skip_duplicate_email", email });
      return;
    }

    if (seenEmails.has(email)) {
      s.duplicatesInBatch++;
      outcomes.push({ index, status: "skip_duplicate_in_batch", email });
      return;
    }
    seenEmails.add(email);

    const sharedPhone = n.phoneNormalized !== null && keys.existingPhones.has(n.phoneNormalized);
    const suppressed =
      keys.suppressedEmails.has(email) || (n.phoneNormalized !== null && keys.suppressedPhones.has(n.phoneNormalized));
    insertRows.push(n);
    s.netInsert++;
    if (sharedPhone) s.sharedPhone++; // counted independently — a row can be both shared-phone and suppressed
    // Per-row label priority: suppressed (won't ever send) dominates the shared-phone flag on screen,
    // but both are reflected in the summary figures above.
    if (suppressed) {
      s.suppressed++;
      outcomes.push({ index, status: "insert_suppressed", email });
    } else if (sharedPhone) {
      outcomes.push({ index, status: "insert_shared_phone", email });
    } else {
      outcomes.push({ index, status: "insert", email });
    }
  });

  s.netContactable = s.netInsert - s.suppressed;
  return { summary: s, insertRows, outcomes };
}
