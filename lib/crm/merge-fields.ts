/**
 * Mail-merge custom placeholders. Custom fields use UPPERCASE names (e.g. {{KODE_UNIK}}) to
 * distinguish them from the built-in lowercase vocabulary ({{full_name}}, {{city}}, etc.).
 */

import { TEMPLATE_VARIABLES } from "./template";

const MERGE_FIELD_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

/** Built-in variable names (lowercase) — never treated as custom merge fields. */
const BUILTIN_SET = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.toLowerCase()));

/** Detect UPPERCASE custom merge placeholders in text. Returns deduplicated names in first-seen order. */
export function detectMergePlaceholders(...parts: (string | null | undefined)[]): string[] {
  const text = parts.filter((p): p is string => typeof p === "string").join("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(MERGE_FIELD_PATTERN))) {
    const name = m[1];
    if (!seen.has(name) && !BUILTIN_SET.has(name.toLowerCase())) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** Replace UPPERCASE custom merge placeholders with per-recipient values. Unknown fields → empty string. */
export function replaceMergePlaceholders(text: string, mergeValues: Record<string, string>): string {
  return text.replace(MERGE_FIELD_PATTERN, (_full, name: string) => {
    return mergeValues[name] ?? "";
  });
}

export interface MergeCSVValidation {
  ok: boolean;
  errors: string[];
  /** Parsed rows: email_normalized → field values. */
  rows: Map<string, Record<string, string>>;
  /** Field names found in CSV header (uppercase). */
  fields: string[];
}

/**
 * Validate a parsed CSV for merge data upload. Expects the first column to be "email" and remaining
 * columns to be UPPERCASE field names matching detected placeholders.
 */
export function validateMergeCSV(
  headers: string[],
  rows: string[][],
  expectedFields: string[],
): MergeCSVValidation {
  const errors: string[] = [];
  const result: Map<string, Record<string, string>> = new Map();

  if (headers.length < 2) {
    errors.push("CSV harus punya minimal 2 kolom: email dan minimal 1 field merge.");
    return { ok: false, errors, rows: result, fields: [] };
  }

  const emailCol = headers[0].trim().toLowerCase();
  if (emailCol !== "email") {
    errors.push(`Kolom pertama harus "email", ditemukan "${headers[0]}".`);
    return { ok: false, errors, rows: result, fields: [] };
  }

  const fields = headers.slice(1).map((h) => h.trim());
  const expectedSet = new Set(expectedFields);
  const missingFields = expectedFields.filter((f) => !fields.includes(f));
  const extraFields = fields.filter((f) => !expectedSet.has(f));

  if (missingFields.length > 0) {
    errors.push(`Field yang dibutuhkan template tidak ada di CSV: ${missingFields.join(", ")}`);
  }
  if (extraFields.length > 0) {
    errors.push(`Field di CSV tidak ada di template: ${extraFields.join(", ")}`);
  }

  const seenEmails = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = (row[0] ?? "").trim().toLowerCase();
    if (!email) {
      errors.push(`Baris ${i + 2}: email kosong.`);
      continue;
    }
    if (seenEmails.has(email)) {
      errors.push(`Baris ${i + 2}: email duplikat "${email}".`);
      continue;
    }
    seenEmails.add(email);

    const values: Record<string, string> = {};
    for (let j = 0; j < fields.length; j++) {
      values[fields[j]] = (row[j + 1] ?? "").trim();
    }
    result.set(email, values);
  }

  return { ok: errors.length === 0, errors, rows: result, fields };
}
