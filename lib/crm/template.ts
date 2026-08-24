/**
 * Message-template pure core (contacting-half, TUGAS 2). Client- AND server-safe (no I/O), so the
 * editor and the (future) save route validate against the SAME rules and can never disagree about
 * what a valid template is — the "one rule, two implementations" trap that has been this project's
 * costliest bug four times over.
 *
 * WHAT IS HERE (no database needed, so it is fully unit-tested now):
 *   - the CLOSED variable vocabulary + validation (an unknown {{var}} is rejected at SAVE, never
 *     discovered at send — a template that breaks while going to 10,000 people is expensive);
 *   - variable extraction + substitution (used for both the sample-data preview and the real send);
 *   - the channel / approval / language vocabularies the storage layer will reuse.
 *
 * WHAT IS NOT HERE: the table + read/write layer + editor UI. Storage is a new crm_* table, which
 * is a migration, and this project runs migrations one-by-one under an explicit gate (README ledger
 * warning). The proposed schema is in docs/RENCANA-template-simpan.md — SHOWN, not applied. This
 * module is the part that ships with zero schema change and locks the rules the schema will serve.
 */

export type TemplateChannel = "email" | "whatsapp";
export const TEMPLATE_CHANNELS: readonly TemplateChannel[] = ["email", "whatsapp"];

/** WhatsApp template approval (Meta). Email templates are always "not_applicable". */
export type WaApprovalStatus = "not_applicable" | "draft" | "pending" | "approved" | "rejected";
export const WA_APPROVAL_STATUSES: readonly WaApprovalStatus[] = [
  "not_applicable", "draft", "pending", "approved", "rejected",
];

/**
 * THE closed variable vocabulary. A template may reference ONLY these; anything else is rejected at
 * save. Deliberately small and non-sensitive: no NIK, no health, no raw contact beyond the name the
 * recipient already knows is theirs. `unsubscribe_url` is here because every marketing email MUST
 * carry the unsubscribe link (TUGAS 3) — the send layer substitutes the signed per-recipient URL.
 * Adding a variable is a deliberate edit HERE (one place), not an ad-hoc string in a template.
 */
export const TEMPLATE_VARIABLES = [
  "full_name",
  "first_name",
  "city",
  "unsubscribe_url",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

const VAR_PATTERN = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

/** Every distinct `{{name}}` referenced in the text, lower-cased, in first-seen order. */
export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(VAR_PATTERN))) {
    const name = m[1].toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export interface TemplateValidation {
  ok: boolean;
  /** Referenced names that are NOT in the closed vocabulary — the reason a save is rejected. */
  unknown: string[];
  /** Referenced names that ARE valid (for the editor to show "this template uses…"). */
  used: TemplateVariable[];
}

/**
 * Validate the variables in a template body (and, for email, its subject). Pure. `ok` is false iff
 * any referenced variable is outside TEMPLATE_VARIABLES. This is the SAVE-time gate.
 */
export function validateTemplateVariables(...parts: (string | null | undefined)[]): TemplateValidation {
  const allowed = new Set<string>(TEMPLATE_VARIABLES);
  const refs = extractVariables(parts.filter((p): p is string => typeof p === "string").join("\n"));
  const unknown = refs.filter((r) => !allowed.has(r));
  const used = refs.filter((r): r is TemplateVariable => allowed.has(r));
  return { ok: unknown.length === 0, unknown, used };
}

/**
 * Substitute `{{var}}` with values. Used for BOTH the sample-data preview and the real send. A
 * variable with no provided value renders as an empty string (never the literal `{{var}}` — a
 * recipient must never see raw template syntax). Unknown variables are left untouched only if
 * validation was skipped; callers validate first, so in practice every `{{var}}` is substituted.
 */
export function renderTemplate(text: string, values: Partial<Record<TemplateVariable, string>>): string {
  return text.replace(VAR_PATTERN, (_full, rawName: string) => {
    const name = rawName.toLowerCase() as TemplateVariable;
    if ((TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      return values[name] ?? "";
    }
    return ""; // an out-of-vocabulary token never reaches a recipient as literal syntax
  });
}

/** Sample values for the PREVIEW — fictional, never a real customer's data (LARANGAN). */
export const TEMPLATE_PREVIEW_SAMPLE: Record<TemplateVariable, string> = {
  full_name: "Budi Santoso",
  first_name: "Budi",
  city: "Jakarta",
  unsubscribe_url: "https://…/unsubscribe?token=CONTOH",
};

export function previewTemplate(text: string): string {
  return renderTemplate(text, TEMPLATE_PREVIEW_SAMPLE);
}
