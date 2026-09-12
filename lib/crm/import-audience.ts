import { normalizeEmail, normalizePhoneID } from "./normalize";
import { isOperatorTag, parseTagCell, slugifyTagValue } from "./tags";

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
 *  - Dedup is EMAIL-PRIMARY, SKIP-ONLY (K-57): an EMAIL match with an existing person is skipped; a
 *    phone-only match is INSERTED and flagged (a shared number must not drop a distinct person), with
 *    the colliding phone nulled at write. Never merged, never overwritten. Master stays authoritative.
 *  - Suppression still wins. A NET-NEW person whose EMAIL is suppressed is imported (a real new person)
 *    but counted separately — their email is written intact, so send-time suppression still catches them.
 *    A person whose SHARED phone (one already in master) is suppressed is NOT imported at all (opsi d):
 *    that phone is nulled at write, which would blind phone-suppression, so we refuse to create a
 *    contactable identity for a number whose owner opted out. This closes the gap for suppressions that
 *    exist at import time; the after-import residual is opsi (b), deferred (see K-57).
 */

/** Hard cap per file. This is a MEASURED number, not a guess (⏱ DIUKUR 2026-09-08). The write path
 *  is one RPC statement, and on the app path that statement is bounded by an 8 s statement_timeout
 *  (verified: the `authenticator` role PostgREST logs in as carries statement_timeout=8s, and that
 *  login setting survives the per-request `SET ROLE service_role` — which is why a 1.432-row file
 *  raised 57014). After adding idx_master_customer_phone_lookup the RPC runs linearly:
 *  15.000 rows = ~3,8 s, 20.000 = ~3–4,3 s, 25.000 = ~6 s (rolled-back synthetic benches, warm).
 *  15.000 sits under HALF the 8 s ceiling, a ~2× safety margin against cold-cache/role variance we
 *  could not measure without a real production import — so that is the honest cap. The previous
 *  20.000 was written UNTESTED and failed at 1.432 (7 %); see docs/riwayat/TEMUAN.md T-68.
 *  One constant, referenced everywhere. */
export const MAX_IMPORT_ROWS = 15_000;

/** Safe columns only (Fase 0 honored, same class as the activity ingest). DOB / gender / NIK / health
 *  are deliberately NOT importable here — they need their own legal basis. */
export const IMPORT_TARGET_FIELDS = ["full_name", "email", "phone", "city", "tags", "ignore"] as const;
export type ImportField = (typeof IMPORT_TARGET_FIELDS)[number];

/** All 8 operator namespaces, available as column-mapping targets in the import UI. A column mapped
 *  to `ns:kategori` turns every unique cell value into a `kategori:<slug>` tag. Matches TAG_NAMESPACES
 *  in tags.ts — the closed set an operator may use. */
export const NAMESPACE_MAPPING_TARGETS = ["event", "format", "kategori", "nilai", "peran", "produk", "sumber", "tipe"] as const;

/** A column mapping target: a standard import field OR a namespace tag mapping (`ns:event` etc.). */
export type MappingTarget = ImportField | `ns:${(typeof NAMESPACE_MAPPING_TARGETS)[number]}`;

/** Maps a CSV header (verbatim) to the destination field or namespace it fills, or "ignore". */
export type ColumnMapping = Record<string, MappingTarget>;

/** Header-name heuristics for the auto-guess. Phone and city were removed — the UI maps those to
 *  namespace tags instead. The operator can always override in the UI. */
const GUESS: { field: ImportField; re: RegExp }[] = [
  { field: "email", re: /\b(e-?mail|surel|alamat\s*e-?mail)\b/i },
  { field: "tags", re: /\b(tags?|label|penanda)\b/i },
  { field: "full_name", re: /\b(full[_\s]*name|nama\s*lengkap|nama|name)\b/i },
];

const EMAIL_CONTENT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Best-effort header→field guess. First matching pattern wins; each field is used at most once
 *  (the first header that matches it), the rest default to "ignore". When `rows` are provided and
 *  no header matched "email", a content-based pass detects a column where ≥80% of non-empty values
 *  look like email addresses. */
export function guessColumnMapping(headers: string[], rows?: Record<string, string>[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const h of headers) {
    const hit = GUESS.find((g) => g.re.test(h) && !used.has(g.field));
    if (hit) {
      mapping[h] = hit.field;
      used.add(hit.field);
    } else {
      mapping[h] = "ignore";
    }
  }
  if (!used.has("email") && rows && rows.length > 0) {
    for (const h of headers) {
      if (mapping[h] !== "ignore") continue;
      const nonEmpty = rows.filter((r) => (r[h] ?? "").trim() !== "");
      if (nonEmpty.length === 0) continue;
      const emailCount = nonEmpty.filter((r) => EMAIL_CONTENT_RE.test((r[h] ?? "").trim())).length;
      if (emailCount / nonEmpty.length >= 0.8) {
        mapping[h] = "email";
        break;
      }
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
  /** True when the raw phone was mangled by Excel into scientific notation (e.g. "6,28129E+12") — the
   *  original digits are GONE and unrecoverable, so the phone is dropped (never guessed-fixed) and the
   *  operator is told, not left in the dark. The row can still import on its email. */
  phoneExcelBroken: boolean;
  /** Valid operator tags from this row's `tags` cell + namespace-mapped columns, normalized + deduplicated. */
  tags: string[];
  /** Tags this row supplied that the canon refuses — reported per row, never dropped in silence. */
  invalidTags: string[];
  /** Tags generated from namespace-mapped columns on this row: tag → original CSV value (for registry). */
  generatedTagLabels: Record<string, string>;
}

/** Excel silently rewrites a long number (a phone!) as scientific notation when a column isn't Text:
 *  "6.28129E+12" / "6,28129E+12" / "6E+12". The digits are lost for good. We DETECT and REJECT — never
 *  "repair" — because there is nothing left to repair. Fix at source: format the column as Text. */
const EXCEL_SCI_NOTATION = /^\d([.,]\d+)?e[+-]?\d+$/i;

export function isExcelBrokenPhone(raw: string | null | undefined): boolean {
  return raw != null && EXCEL_SCI_NOTATION.test(raw.trim());
}

/** Apply a mapping to one raw CSV record and normalize the contact identities through the ONE canon
 *  (normalize.ts) so dedup and suppression match exactly what the DB stores. Namespace-mapped columns
 *  (ns:*) are slugified and added as tags; their original CSV values are tracked for registry. */
export function normalizeMappedRow(raw: Record<string, string>, mapping: ColumnMapping): NormalizedRow {
  let fullName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let city: string | null = null;
  let tagCell: string | null = null;
  const nsTags: string[] = [];
  const nsInvalid: string[] = [];
  const generatedTagLabels: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    const v = (raw[header] ?? "").trim();
    if (v === "") continue;
    if (field === "full_name") fullName = v;
    else if (field === "email") email = v;
    else if (field === "phone") phone = v;
    else if (field === "city") city = v;
    else if (field === "tags") tagCell = v;
    else if (typeof field === "string" && field.startsWith("ns:")) {
      const ns = field.slice(3);
      const slug = slugifyTagValue(v);
      if (slug === "") continue;
      const tag = `${ns}:${slug}`;
      if (isOperatorTag(tag)) {
        if (!nsTags.includes(tag)) {
          nsTags.push(tag);
          generatedTagLabels[tag] = v;
        }
      } else {
        nsInvalid.push(tag);
      }
    }
  }
  const phoneExcelBroken = isExcelBrokenPhone(phone);
  const parsed = parseTagCell(tagCell);
  return {
    fullName: fullName || null,
    email: email || null,
    emailNormalized: normalizeEmail(email),
    phoneNormalized: phoneExcelBroken ? null : normalizePhoneID(phone),
    city: city || null,
    phoneExcelBroken,
    tags: Array.from(new Set([...parsed.tags, ...nsTags])).sort(),
    invalidTags: [...parsed.invalid, ...nsInvalid],
    generatedTagLabels,
  };
}

export type RowStatus =
  | "insert"
  | "insert_suppressed" // will be inserted, but is suppressed → will never receive a send
  | "insert_shared_phone" // NEW email, but the phone matches an existing contact — INSERTED (email is the
  //                         identity key) and flagged; the shared phone is nulled at write (master's phone
  //                         is unique), so a distinct person is never dropped just for sharing a number.
  | "skip_shared_phone_suppressed" // (K-57, opsi d) shared phone that is CURRENTLY suppressed → NOT imported.
  //                         The shared phone would be nulled at write, so a phone-keyed suppression on it
  //                         would be invisible at send. We refuse to create a contactable identity for a
  //                         number whose owner asked to stop — the row is skipped, closing the gap for
  //                         suppressions that exist at import time.
  | "skip_duplicate_email" // email matches a person already in master → skipped (identity is unambiguous)
  | "skip_merged" // (T-55) email matches ONLY rows whose `merged_into` is set — a merged row moved its
  //                         data elsewhere, so the ingest function's `upd` deliberately refuses to tag it.
  //                         Neither inserted (the SQL anti-join sees the merged row and skips) nor tagged.
  //                         Given its OWN class, and its own count, so the reduction is VISIBLE. The number
  //                         may go down; it may not go down in silence.
  | "skip_duplicate_in_batch" // same email appeared earlier in this file
  | "skip_invalid"; // no usable email (email is required in Fase 1)

export interface RowOutcome {
  index: number; // 0-based row index within the data rows
  status: RowStatus;
  email: string | null;
  /** Tags this row supplied that the canon refuses (TUGAS E). Carried on EVERY outcome, including a
   *  clean `insert`: a row can import perfectly and still have had a tag thrown away, and that is
   *  exactly the kind of thing this system has been losing in silence. The row still imports with
   *  its valid tags — one mistyped tag should not reject a whole file — but the operator sees which
   *  ones were refused, per row, before confirming. */
  invalidTags: string[];
}

export interface ImportSummary {
  read: number; // total data rows read
  validEmail: number; // rows with a usable (normalizable) email
  duplicatesEmail: number; // skipped: email matches an existing person (dedup is email-primary)
  duplicatesInBatch: number;
  invalid: number; // no valid email
  phoneExcelBroken: number; // rows whose phone was Excel-mangled to scientific notation — phone dropped,
  //                           row still counts under its email disposition; surfaced so the operator
  //                           knows to re-export the source column as Text. Independent of every other
  //                           figure (a broken phone can accompany a valid email that inserts, a
  //                           duplicate, etc.).
  sharedPhone: number; // INSERTED, but the phone matches an existing contact (shared number) — surfaced
  //                      as its own figure so the operator sees it before confirming, not hidden.
  sharedPhoneSuppressed: number; // SKIPPED (opsi d): shared phone that is currently suppressed. Not
  //                      imported — a contactable identity is never created for a number whose owner
  //                      opted out. Counted so the operator sees the guard fired. Usually 0.
  sharedPhoneInBatch: number; // INSERTED, but the phone appears on MORE THAN ONE row of this same file
  //                      — so the write nulls it on every one of them. Kept apart from sharedPhone
  //                      because the follow-up differs: sharedPhone means "this number belongs to
  //                      another customer", sharedPhoneInBatch means "your file lists this number
  //                      twice". Same distinction as duplicatesEmail vs duplicatesInBatch.
  rowsWithInvalidTags: number; // rows that supplied at least one tag the canon refuses — shown so a
  //                      dropped tag is never silent, even on a row that otherwise imports cleanly.
  taggedExisting: number; // NOT imported (email already in master) but TAGGED with this batch's tags.
  //                      The population the tag work exists for: Hyrox participants who are already
  //                      20FIT customers. Marked `tagged:<batch>`, never `batch:<batch>` — see the
  //                      migration header — and their row is touched on the tags column only.
  skippedMerged: number; // (T-55, owner decision 7 Sep 2026 = options 1+3 together) rows whose email
  //                      matches ONLY already-merged people. The planner now filters them, so its
  //                      taggedExisting equals the `tagged_existing` the SQL returns — and this count
  //                      is what makes that filtering visible instead of a quiet shortfall between the
  //                      dry-run screen and the report screen. Zero today: production carries 0 rows
  //                      with `merged_into` set (measured 7 Sep 2026). Following the person to their
  //                      successor row is a SEPARATE behavioural decision, deliberately deferred.
  suppressed: number; // net-new rows that are suppressed (inserted, but will never receive)
  netInsert: number; // total rows that will be inserted (INCLUDING suppressed and shared-phone)
  netContactable: number; // netInsert − suppressed (the count that can actually be sent to)
}

/**
 * How many people this run will ACTUALLY change — inserts PLUS existing people it tags (K-58). The
 * confirm button gates on THIS, not on netInsert alone.
 *
 * BUG (8 Sep 2026, T-67): the button gated on `netInsert > 0`, so a file whose every row was already
 * in the pool — netInsert 0, taggedExisting 2 — left the button dead. Tagging existing participants
 * is HALF the work K-58 exists for, and the UI could not trigger it. A happy-path test never caught
 * it; an all-"already exists" input did. Pure + tested so it cannot regress.
 */
export function importActionableTotal(s: Pick<ImportSummary, "netInsert" | "taggedExisting">): number {
  return s.netInsert + s.taggedExisting;
}

/** May the operator press confirm? Something to do (insert OR tag) AND a collection source given. */
export function canRunImport(
  s: Pick<ImportSummary, "netInsert" | "taggedExisting">,
  collectionSource: string,
): boolean {
  return importActionableTotal(s) > 0 && collectionSource.trim() !== "";
}

export interface ImportReconciliation {
  ok: boolean;
  expectedInserted: number; // plan.netInsert
  actualInserted: number; // what the RPC returned it inserted
  expectedTagged: number; // plan.taggedExisting
  actualTagged: number; // what the RPC returned it tagged
}

/**
 * The honest-report check (T-69). The plan (TypeScript) decides who to insert and tag; the ingest RPC
 * (SQL) then does the write and returns its own counts. When those AGREE, the import did exactly what
 * was promised. When they DISAGREE — the exact shape of the 8 Sep bug: plan said netInsert 1.432 but
 * the RPC returned inserted 857, tagged 0 — people were silently dropped between plan and write, and
 * the screen MUST NOT show a green "selesai". This reconciliation is the runtime expression of the
 * invariant `inserted + tagged == valid unique emails − merged − suppressed-skipped`: that right-hand
 * side is exactly `netInsert + taggedExisting`, so `inserted == netInsert AND tagged == taggedExisting`
 * is the same statement, split into its two halves so the warning can name which side broke.
 *
 * With loadKeys now fail-loud + chunked the original cause cannot recur; this stays as defence in depth
 * — it catches ANY future divergence (a race, a new anti-join change) instead of hiding it.
 */
export function reconcileImport(
  summary: Pick<ImportSummary, "netInsert" | "taggedExisting">,
  committed: { inserted: number; taggedExisting: number },
): ImportReconciliation {
  return {
    ok: committed.inserted === summary.netInsert && committed.taggedExisting === summary.taggedExisting,
    expectedInserted: summary.netInsert,
    actualInserted: committed.inserted,
    expectedTagged: summary.taggedExisting,
    actualTagged: committed.taggedExisting,
  };
}

export interface ImportPlan {
  summary: ImportSummary;
  insertRows: NormalizedRow[]; // exactly the rows to hand to the ingest function
  /** People ALREADY in master that this batch TAGS instead of importing (K-58), each with the tags
   *  from THEIR row — tags differ per row even inside one event file. Decided here, never re-derived
   *  in SQL: the planner is the single decision point, so the dry-run count and the write act on the
   *  same list. A phone-only match is NOT here — that is a different person, who is inserted (K-57). */
  tagTargets: { email: string; tags: string[] }[];
  outcomes: RowOutcome[]; // per-row disposition, for the post-run report
  /** Tags generated from namespace-mapped columns, aggregated across all rows: tag → original CSV
   *  label. Used to auto-register new tags in crm_tag_registry on execute. */
  generatedTagLabels: Record<string, string>;
}

export interface ImportKeys {
  existingEmails: ReadonlySet<string>; // normalized emails already in master_customer (INCLUDING merged
  //                      rows — this set decides INSERT-vs-not, and it must match the ingest function's
  //                      anti-join, which also sees merged rows. Narrowing it would classify a row as
  //                      `insert` that the SQL then refuses to insert: the same silence, mirrored.)
  taggableEmails: ReadonlySet<string>; // (T-55) the subset of existingEmails with at least one row whose
  //                      `merged_into` IS NULL — i.e. the people the ingest function's `upd` will
  //                      actually tag. An email present in existingEmails but absent here matches only
  //                      merged rows: skip_merged. Two sets, not one, because "already in the pool" and
  //                      "taggable" stopped being the same question the moment merging existed.
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
  const tagTargets: { email: string; tags: string[] }[] = [];
  const seenEmails = new Set<string>(); // emails already accepted from THIS file
  const taggedSeen = new Set<string>(); // emails already queued for tagging from THIS file
  const allGeneratedTagLabels: Record<string, string> = {};
  const s: ImportSummary = {
    read: rows.length,
    validEmail: 0,
    duplicatesEmail: 0,
    duplicatesInBatch: 0,
    invalid: 0,
    phoneExcelBroken: 0,
    sharedPhone: 0,
    sharedPhoneInBatch: 0,
    rowsWithInvalidTags: 0,
    taggedExisting: 0,
    skippedMerged: 0,
    sharedPhoneSuppressed: 0,
    suppressed: 0,
    netInsert: 0,
    netContactable: 0,
  };

  rows.forEach((raw, index) => {
    const n = normalizeMappedRow(raw, mapping);
    for (const [tag, label] of Object.entries(n.generatedTagLabels)) {
      if (!allGeneratedTagLabels[tag]) allGeneratedTagLabels[tag] = label;
    }
    const email = n.emailNormalized;

    // Count a mangled phone once, independent of what happens to the row below (its email may be valid
    // and insert, or invalid and skip) — the operator is told either way, never silently.
    if (n.phoneExcelBroken) s.phoneExcelBroken++;
    if (n.invalidTags.length > 0) s.rowsWithInvalidTags++;

    if (email === null) {
      s.invalid++;
      outcomes.push({ index, status: "skip_invalid", email: null, invalidTags: n.invalidTags });
      return;
    }
    s.validEmail++;

    // Dedup is EMAIL-PRIMARY (K-57): email is a personal identity, so an email match is an unambiguous
    // duplicate → skip. A phone is a SHARED identifier (household, a parent registering children, an
    // office line), so a phone-only match must NOT drop a distinct person — it is inserted and flagged
    // instead. Suppression stays keyed on both (below); being in the pool never means being contactable.
    if (keys.existingEmails.has(email)) {
      s.duplicatesEmail++;
      // (T-55) An email that matches ONLY merged rows is neither inserted nor tagged: the SQL
      // anti-join sees the merged row so no insert happens, and `upd` filters `merged_into is null`
      // so no tag happens. Before this branch existed the planner still counted it under
      // taggedExisting, so the dry-run screen promised a tag that the write never applied and the
      // report screen simply showed a smaller number with nothing to explain it. Now it is its own
      // class with its own count — the figure may shrink, but not quietly.
      if (!keys.taggableEmails.has(email)) {
        s.skippedMerged++;
        outcomes.push({ index, status: "skip_merged", email, invalidTags: n.invalidTags });
        return;
      }
      // Not imported — but TAGGED (K-58). A tag is not a gate: tagging contacts nobody, and
      // suppression still bites at send, so an email that matches a currently-suppressed person is
      // tagged too. Deduplicated because the same email can appear twice in one file.
      if (!taggedSeen.has(email)) {
        taggedSeen.add(email);
        tagTargets.push({ email, tags: n.tags });
        s.taggedExisting++;
      }
      outcomes.push({ index, status: "skip_duplicate_email", email, invalidTags: n.invalidTags });
      return;
    }

    if (seenEmails.has(email)) {
      s.duplicatesInBatch++;
      outcomes.push({ index, status: "skip_duplicate_in_batch", email, invalidTags: n.invalidTags });
      return;
    }
    seenEmails.add(email);

    const sharedPhone = n.phoneNormalized !== null && keys.existingPhones.has(n.phoneNormalized);
    const suppressedByEmail = keys.suppressedEmails.has(email);
    const suppressedByPhone = n.phoneNormalized !== null && keys.suppressedPhones.has(n.phoneNormalized);

    // (d) SUPPRESSION CARVE-OUT (K-57). A shared phone is nulled at write (master's phone is unique), so
    // a phone-keyed suppression on that number is invisible to send-time suppression (fetchSuppressedCustomerIds
    // resolves phones via phone_normalized, which is now NULL for this row). If the colliding phone is
    // CURRENTLY suppressed, we must NOT create a contactable identity for it — skip the row entirely. This
    // closes the gap FULLY for suppressions that exist at import time. The residual (a phone opt-out recorded
    // AFTER import on the nulled number) is only closed by relaxing the phone unique index (opsi b, deferred);
    // measured empty today (0 phone-keyed suppressions ever, verified 2026-09-03). Email suppression is NOT
    // carved out here: an email is written intact, so it stays matchable at send — those rows insert-as-suppressed.
    if (sharedPhone && suppressedByPhone) {
      s.sharedPhoneSuppressed++;
      outcomes.push({ index, status: "skip_shared_phone_suppressed", email, invalidTags: n.invalidTags });
      return;
    }

    const suppressed = suppressedByEmail || suppressedByPhone;
    insertRows.push(n);
    s.netInsert++;
    if (sharedPhone) s.sharedPhone++; // counted independently — a row can be both shared-phone and suppressed
    // Per-row label priority: suppressed (won't ever send) dominates the shared-phone flag on screen,
    // but both are reflected in the summary figures above.
    if (suppressed) {
      s.suppressed++;
      outcomes.push({ index, status: "insert_suppressed", email, invalidTags: n.invalidTags });
    } else if (sharedPhone) {
      outcomes.push({ index, status: "insert_shared_phone", email, invalidTags: n.invalidTags });
    } else {
      outcomes.push({ index, status: "insert", email, invalidTags: n.invalidTags });
    }
  });

  // A phone shared BETWEEN rows of this file can only be known once every row is placed, so it is a
  // second pass. The write nulls the phone on EVERY row of a colliding group (not just the extras),
  // so every one of them is counted — a number used twice costs two phones, not one.
  const phoneUses = new Map<string, number>();
  for (const r of insertRows) {
    if (r.phoneNormalized) phoneUses.set(r.phoneNormalized, (phoneUses.get(r.phoneNormalized) ?? 0) + 1);
  }
  for (const r of insertRows) {
    if (r.phoneNormalized && (phoneUses.get(r.phoneNormalized) ?? 0) > 1) s.sharedPhoneInBatch++;
  }

  s.netContactable = s.netInsert - s.suppressed;
  return { summary: s, insertRows, tagTargets, outcomes, generatedTagLabels: allGeneratedTagLabels };
}

/**
 * The operator-facing message for a FAILED import write, from the database's error code alone
 * (T-49). Pure, so it is testable and so it can never accidentally be handed anything but a code.
 *
 * WHAT THIS REPLACES. The route used to answer every failure with "Gagal memproses impor. Coba lagi."
 * — which hid the cause AND advised an action that could not work: when the RPC does not exist, or
 * the value violates a CHECK, retrying is guaranteed to fail again. It also fed the raw Postgres
 * message into a field typed as a code; Postgres messages are not ours to trust with PII.
 *
 * So the class is named, and each message says plainly whether retrying can help. `code` is already
 * shape-guarded (safeCode) before it reaches here — never prose, never a row value.
 */
export function importFailureMessage(code: string | null): string {
  switch (code) {
    case "PGRST202":
    case "42883":
      return `Jalur tulis impor belum ada di database (kode ${code}). Migrasi crm_ingest_csv_people belum diterapkan — mengulang tidak akan berhasil sampai migrasi itu dijalankan.`;
    case "23514":
      return "Database menolak nilai yang ditulis impor (pelanggaran aturan kolom, kode 23514). Ini cacat konfigurasi impor, bukan masalah berkas Anda — mengulang tidak akan berhasil. Laporkan kodenya.";
    case "23505":
      return "Ada baris yang bentrok dengan data yang sudah ada (kode 23505). Pra-cek meloloskannya, jadi ini perlu ditinjau — mengulang berkas yang sama kemungkinan besar gagal lagi.";
    case "23503":
      return "Baris impor merujuk data yang tidak ada (kode 23503). Perlu ditinjau — mengulang tidak akan berhasil.";
    case "42501":
      return "Peran yang dipakai tidak berwenang menjalankan impor (kode 42501). Ini soal hak akses, bukan berkas Anda.";
    case "read_failed":
      return "Impor dibatalkan: gagal membaca data pembanding (dedup/suppression) dari database, jadi TIDAK ADA yang ditulis. Ini bukan salah berkas Anda dan tidak ada data yang masuk sebagian — coba lagi; kalau berulang, laporkan.";
    case "57014":
      return `Impor melewati anggaran waktu database 8 detik dan dibatalkan (kode 57014). Batas aman yang terukur adalah ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris per file — pecah file menjadi beberapa bagian di bawah angka itu, lalu impor bergiliran. Jika file Anda sudah di bawah ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris, ini di luar dugaan (bukan salah berkas Anda): catat kejadiannya dan laporkan, jangan diulang berkali-kali.`;
    case null:
      return "Impor gagal dan database tidak memberi kode. Laporkan kejadian ini — jangan diulang berkali-kali tanpa penjelasan.";
    default:
      return `Impor gagal (kode ${code}). Laporkan kode ini — mengulang tanpa ada yang berubah kemungkinan besar gagal lagi.`;
  }
}
