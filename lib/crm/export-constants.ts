/**
 * Segment CSV export — constants + PURE helpers (Sprint 4A TUGAS 2). Client-safe: the segment
 * builder imports the threshold + the gate helper; the server route imports the columns + CSV
 * helpers. The streaming query code is in lib/crm/export.ts (server-only).
 *
 * A downloaded file cannot be un-downloaded, so the rules here are strict by construction, not
 * by good intentions:
 *   - Only the columns in EXPORT_COLUMNS are ever written. NIK, date of birth, and ALL clinical
 *     data are absent from that list and present in EXPORT_FORBIDDEN_COLUMNS; a guard test asserts
 *     the two never overlap. Export reads master_customer ONLY — it never joins the staging DOB,
 *     the Hyrox NIK, or the clinic chain, so those cannot leak into a file regardless of role.
 *   - The action name is fixed to `export.performed`, which the migration-8 compliance denylist
 *     excludes from purge permanently (prefix `export.`). A parity test pins the exact name.
 */

import type { Action } from "@/lib/auth/roles";
import type { FilterNode } from "./filter-tree";

/**
 * THE THRESHOLD (rows) that splits `export.at_or_below_threshold` from
 * `export.above_threshold` in PRD 17.2. The PRD names the split but not the number, so this is
 * OURS — stated, not hidden — pending a PRD figure (same footing as the /quality tone cutoffs).
 * 1.000: a working contact list is in the hundreds; past a thousand it is a bulk extract, which
 * the matrix reserves for super_admin / crm_manager. Changing it changes which grant is checked.
 */
export const EXPORT_THRESHOLD = 1000;

/** Which export action a segment of `rowCount` rows requires. `≤` is at-or-below (PRD wording). */
export function thresholdAction(rowCount: number): Action {
  return rowCount <= EXPORT_THRESHOLD ? "export.at_or_below_threshold" : "export.above_threshold";
}

/** One exportable column: the physical master_customer column, its CSV header label, and the
 *  i18n key for that label. `asText` marks a value that must render as text in a spreadsheet
 *  (long digit runs Excel would otherwise mangle into scientific notation — see excelText). */
export interface ExportColumn {
  column: string;
  header: string;
  /** i18n key under Dict["export"]["headers"]; defaults to `column` when omitted. */
  headerKey?: string;
  asText?: boolean;
}

/**
 * CONTACT COLUMNS follow the category (Export sprint MASALAH 1): a column guaranteed empty for
 * every row in a category is noise, so it is dropped. `email`/`phone` toggle which contact
 * columns are written; the attribute columns are always present.
 *
 * WHY `email_normalized`, not raw `email` (MASALAH 3 decision): `email_normalized` is the ONE
 * contactability identity used everywhere in this system (dashboard "bisa dihubungi", consent
 * matching, the segment filter). The filter's "has email" / "no email" already keys off it, so
 * the DISPLAY must too — otherwise a "no email" category can still print an email (the bug that
 * shipped). NULL means "no usable canonical email"; a well-formed raw email that failed to
 * normalize is a pipeline gap, recorded as a finding, not papered over by switching to raw email
 * (which would also print malformed addresses). email_normalized is the lowercased/trimmed email —
 * fully usable for contact.
 *
 * Only export-permitted roles (super_admin, crm_manager — both hold view_contact) ever reach the
 * streamer; a masked role (analyst) is denied export entirely upstream.
 */
export interface ContactColumns {
  email: boolean;
  phone: boolean;
}

/** Build the ordered column list for a category. Attribute columns always; contact columns per
 *  `contact`. Order is stable: id, name, [email], [phone], city, unit, segment, ltv. */
export function resolveExportColumns(contact: ContactColumns): ExportColumn[] {
  const cols: ExportColumn[] = [
    { column: "customer_id", header: "customer_id" },
    { column: "full_name", header: "nama" },
  ];
  if (contact.email) cols.push({ column: "email_normalized", header: "email", headerKey: "email" });
  if (contact.phone) cols.push({ column: "phone_normalized", header: "telepon", asText: true });
  cols.push(
    { column: "city", header: "kota" },
    { column: "first_unit", header: "unit_pertama" },
    { column: "segment", header: "segment" },
    { column: "lifetime_value", header: "lifetime_value" },
  );
  return cols;
}

/** The default (both contact columns) — used when no category narrows contact coverage, and by
 *  the safety guard test (which also checks every per-category variant). */
export const EXPORT_COLUMNS: readonly ExportColumn[] = resolveExportColumns({ email: true, phone: true });

/**
 * Which contact columns a filter tree can still contain. Conservative: a contact column is only
 * dropped when a TOP-LEVEL AND condition guarantees its absence (a `noEmail` / `noPhone` leaf →
 * that column is NULL for every matched row). Any other shape keeps both columns — a column is
 * never dropped when a row might carry data. Mirrors the same `email_normalized` / `phone_normalized`
 * fields the filter tests, so display and filter can never disagree.
 */
export function contactColumnsForTree(tree: FilterNode | null | undefined): ContactColumns {
  const contact: ContactColumns = { email: true, phone: true };
  if (tree && tree.kind === "group" && tree.op === "AND") {
    for (const child of tree.children) {
      if (child.kind === "condition" && child.field === "noEmail") contact.email = false;
      if (child.kind === "condition" && child.field === "noPhone") contact.phone = false;
    }
  }
  return contact;
}

/**
 * Columns that must NEVER appear in an export, any role, any purpose — a file outlives the
 * profile.view_health gate. The guard test asserts EXPORT_COLUMNS is disjoint from this set, so
 * a future column addition can't silently smuggle sensitive data into a download.
 */
export const EXPORT_FORBIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  "id_number",
  "nik",
  "date_of_birth",
  "dob",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "diagnosis",
  "diagnoses",
  "results",
  "medication",
  "surgery",
  "gender",
]);

// ── CSV rendering (RFC 4180 + spreadsheet-formula-injection guard) ───────────────────────────

/**
 * Escape one CSV field. RFC 4180: wrap in quotes and double internal quotes when the value
 * contains a comma, quote, CR or LF. PLUS a spreadsheet formula-injection guard: a value that
 * begins with `= + - @` (or a control char) can execute when the file is opened in Excel/Sheets,
 * so it is prefixed with a single quote (OWASP guidance). Customer-supplied names/emails are
 * untrusted text destined for a spreadsheet — this is the one place it becomes dangerous.
 */
export function csvEscape(value: unknown): string {
  if (value == null) return "";
  // Excel-text cell (see excelText): a TRUSTED, system-controlled value (phone digits) wrapped so
  // Excel shows it as text instead of scientific notation. It deliberately uses the `="…"` formula
  // form, so it BYPASSES the injection guard below — safe only because the value is not free text.
  if (typeof value === "object" && value !== null && EXCEL_TEXT in (value as object)) {
    const inner = `="${String((value as Record<symbol, string>)[EXCEL_TEXT]).replace(/"/g, '""')}"`;
    return `"${inner.replace(/"/g, '""')}"`;
  }
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const EXCEL_TEXT = Symbol("excelText");

/**
 * Wrap a TRUSTED value (system-controlled, e.g. a normalized phone number) so a spreadsheet reads
 * it as TEXT (MASALAH 4). Excel treats a long digit run as a number and shows `6,28111E+11`; the
 * `="…"` formula form forces text. TRADE-OFF (stated, not hidden): a downstream CSV consumer that
 * does not evaluate formulas (e.g. a WhatsApp/SMS campaign uploader) sees the literal `="628…"` and
 * must strip the `="` / `"` wrapper. Use ONLY for values that are never free text — never for
 * names/emails/cities, whose injection guard must stay intact.
 */
export function excelText(value: string): { [EXCEL_TEXT]: string } {
  return { [EXCEL_TEXT]: value };
}

/** Render one CSV row (array of raw values) with a trailing CRLF (RFC 4180 line ending). */
export function csvRow(values: readonly unknown[]): string {
  return values.map(csvEscape).join(",") + "\r\n";
}

/** The header row for a given column list. Defaults to the built-in (Indonesian) labels; pass
 *  `headerFor` to localise the titles (Sprint 4B) via each column's headerKey (falls back to the
 *  physical column name). */
export function csvHeader(columns: readonly ExportColumn[] = EXPORT_COLUMNS, headerFor?: (key: string) => string): string {
  return csvRow(columns.map((c) => (headerFor ? headerFor(c.headerKey ?? c.column) : c.header)));
}

/** The fixed audit action for a completed export. Pinned by a parity test to the denylist. */
export const EXPORT_ACTION = "export.performed";

// ── Export file name (MASALAH 2) ─────────────────────────────────────────────────────────────

/**
 * A filesystem-safe slug: lowercase ASCII words joined by single hyphens, capped. Strips anything
 * Windows rejects in a name (`\ / : * ? " < > |`), whitespace, and punctuation (incl. the parens
 * a nested filter sentence can carry). Empty input → "segmen".
 */
export function slugify(input: string, max = 40): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "segmen";
}

/**
 * Export file name: `<base>-<category>-YYYY-MM-DD-HHMM.csv`. The category slug and base word follow
 * the chosen language (via the caller). Date + time (UTC, from the same ISO stamp the file uses)
 * keep several downloads on one day distinct instead of the browser's `(1)`, `(2)`. ASCII-only, so
 * the Content-Disposition header needs no extended encoding.
 */
export function exportFileName(base: string, category: string, nowIso: string): string {
  const date = nowIso.slice(0, 10); // YYYY-MM-DD
  const time = nowIso.slice(11, 16).replace(":", ""); // HHMM
  return `${slugify(base)}-${slugify(category)}-${date}-${time}.csv`;
}
