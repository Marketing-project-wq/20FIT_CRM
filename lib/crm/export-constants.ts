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

/** One exportable column: the physical master_customer column + its CSV header label. */
export interface ExportColumn {
  column: string;
  header: string;
}

/**
 * The ONLY columns ever written to an export, in order. master_customer columns only — contact
 * + attributes needed to actually reach someone (export exists to contact). email/phone are the
 * real values: only export-permitted roles (super_admin, crm_manager — both hold view_contact)
 * ever reach the streamer; a masked role (analyst) is denied export entirely upstream.
 */
export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { column: "customer_id", header: "customer_id" },
  { column: "full_name", header: "nama" },
  { column: "email", header: "email" },
  { column: "phone", header: "telepon" },
  { column: "city", header: "kota" },
  { column: "first_unit", header: "unit_pertama" },
  { column: "segment", header: "segment" },
  { column: "lifetime_value", header: "lifetime_value" },
] as const;

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
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Render one CSV row (array of raw values) with a trailing CRLF (RFC 4180 line ending). */
export function csvRow(values: readonly unknown[]): string {
  return values.map(csvEscape).join(",") + "\r\n";
}

/** The header row (the EXPORT_COLUMNS labels). */
export function csvHeader(): string {
  return csvRow(EXPORT_COLUMNS.map((c) => c.header));
}

/** The fixed audit action for a completed export. Pinned by a parity test to the denylist. */
export const EXPORT_ACTION = "export.performed";
