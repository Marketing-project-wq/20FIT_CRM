/**
 * Mail-merge custom placeholders. Any `{{variable}}` that is NOT a built-in template variable
 * is treated as a custom merge field — regardless of case. Internally, detected field names are
 * UPPERCASED for consistent storage and lookup (so `{{voucher_code}}` and `{{VOUCHER_CODE}}` are
 * the same field).
 */

import { TEMPLATE_VARIABLES } from "./template";

/** Matches any `{{variable}}` placeholder — both built-in (lowercase) and custom (any case). */
const ANY_PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Built-in variable names (lowercase) — never treated as custom merge fields. */
const BUILTIN_SET = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.toLowerCase()));

/** Detect custom merge placeholders in text. Any `{{var}}` that is NOT a built-in variable is
 *  returned as an UPPERCASE field name (normalized for consistent CSV column matching). */
export function detectMergePlaceholders(...parts: (string | null | undefined)[]): string[] {
  const text = parts.filter((p): p is string => typeof p === "string").join("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(ANY_PLACEHOLDER))) {
    const raw = m[1];
    if (BUILTIN_SET.has(raw.toLowerCase())) continue;
    const name = raw.toUpperCase();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Replace custom merge placeholders with per-recipient values. Lookup is case-insensitive:
 *  `{{voucher_code}}` finds a value stored under `VOUCHER_CODE`. Built-in vars are left alone
 *  (they are handled by `renderTemplate` first). Unknown fields → empty string. */
export function replaceMergePlaceholders(text: string, mergeValues: Record<string, string>): string {
  const upper = new Map<string, string>();
  for (const [k, v] of Object.entries(mergeValues)) upper.set(k.toUpperCase(), v);
  return text.replace(ANY_PLACEHOLDER, (_full, raw: string) => {
    if (BUILTIN_SET.has(raw.toLowerCase())) return _full;
    return upper.get(raw.toUpperCase()) ?? "";
  });
}

export interface MergeCSVRow {
  email: string;
  rowIndex: number;
  fields: Record<string, string>;
}

export interface MergeCSVValidation {
  ok: boolean;
  errors: string[];
  rows: MergeCSVRow[];
  /** Field names found in CSV header (uppercase). */
  fields: string[];
}

/**
 * Validate a parsed CSV for merge data upload. Expects the first column to be "email" and remaining
 * columns to match detected placeholders (case-insensitive — CSV header `voucher_code` matches
 * detected placeholder `VOUCHER_CODE`). Field names are stored UPPERCASE for consistent lookup.
 * Duplicate emails are allowed — each row produces a separate send with its own merge values.
 */
export function validateMergeCSV(
  headers: string[],
  rows: string[][],
  expectedFields: string[],
): MergeCSVValidation {
  const errors: string[] = [];
  const result: MergeCSVRow[] = [];

  if (headers.length < 2) {
    errors.push("CSV harus punya minimal 2 kolom: email dan minimal 1 field merge.");
    return { ok: false, errors, rows: result, fields: [] };
  }

  const emailCol = headers[0].trim().toLowerCase();
  if (emailCol !== "email") {
    errors.push(`Kolom pertama harus "email", ditemukan "${headers[0]}".`);
    return { ok: false, errors, rows: result, fields: [] };
  }

  const rawFields = headers.slice(1).map((h) => h.trim());
  const fields = rawFields.map((f) => f.toUpperCase());
  const expectedUpper = new Set(expectedFields.map((f) => f.toUpperCase()));
  const fieldsUpper = new Set(fields);
  const missingFields = expectedFields.filter((f) => !fieldsUpper.has(f.toUpperCase()));
  const extraFields = fields.filter((f) => !expectedUpper.has(f));

  if (missingFields.length > 0) {
    errors.push(`Field yang dibutuhkan template tidak ada di CSV: ${missingFields.join(", ")}`);
  }
  if (extraFields.length > 0) {
    errors.push(`Field di CSV tidak ada di template: ${extraFields.join(", ")}`);
  }

  const emailCount = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = (row[0] ?? "").trim().toLowerCase();
    if (!email) {
      errors.push(`Baris ${i + 2}: email kosong.`);
      continue;
    }

    const idx = emailCount.get(email) ?? 0;
    emailCount.set(email, idx + 1);

    const values: Record<string, string> = {};
    for (let j = 0; j < fields.length; j++) {
      values[fields[j]] = (row[j + 1] ?? "").trim();
    }
    result.push({ email, rowIndex: idx, fields: values });
  }

  return { ok: errors.length === 0, errors, rows: result, fields };
}
