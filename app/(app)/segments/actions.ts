"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n/server";
import { isPermitted } from "@/lib/auth/roles";
import { saveSegment } from "@/lib/crm/segment-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFilterTree, filterTreeToExpr, type FilterNode } from "@/lib/crm/filter-tree";
import { EMPTY_CRITERIA, type SegmentCriteria } from "@/lib/crm/segment";
import { parseEmailListInput, MAX_EMAIL_LIST } from "@/lib/crm/email-list";
import { resolveEmailListRecipients } from "@/lib/crm/send-campaign";
import { fetchSuppressedCustomerIds } from "@/lib/crm/contactability-read";
import { parseCsvText } from "@/lib/crm/csv-parse";
import { guessColumnMapping } from "@/lib/crm/import-audience";
import { logApiFailure } from "@/lib/crm/failure-log";

/**
 * Save a segment DEFINITION (K-40). Gate: segment.build (same as the builder). The AND/OR tree is
 * validated + converted to the master expression server-side with the SAME functions the count path
 * uses, so a saved segment can never mean something the count didn't — and an invalid tree is
 * refused rather than silently saved as the broader flat criteria (which would target more people
 * than the operator built).
 */
export async function saveSegmentAction(input: {
  name: string;
  criteria: SegmentCriteria;
  tree: FilterNode | null;
}): Promise<{ ok: boolean; error?: string; segmentId?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  if (!input.name.trim()) return { ok: false, error: "empty_name" };

  let masterFilterExpr: string | null = null;
  if (input.tree) {
    const valid = validateFilterTree(input.tree, 1, getLang());
    if (!valid.ok) return { ok: false, error: "invalid_tree" };
    masterFilterExpr = filterTreeToExpr(input.tree);
  }

  let email: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    // fail-open on identity only (createdBy null); the row still saves.
  }

  const res = await saveSegment({
    name: input.name,
    stored: { criteria: input.criteria, masterFilterExpr },
    createdBy: email,
  });
  // Surface the new id so the composer can auto-select it after the bounce-back.
  return { ok: res.ok, error: res.error, segmentId: res.id };
}

/** Save a STATIC email-list segment (manual). Gate: segment.build. Emails normalised (trim+lower),
 *  deduped, validated to contain '@'. Stored as emailList in the segment definition — targets those
 *  addresses via overrideRecipients at send, never touching master_customer. Suppression still applies. */
export async function saveEmailListSegmentAction(input: {
  name: string;
  emailsRaw: string;
}): Promise<{ ok: boolean; error?: string; segmentId?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  if (!input.name.trim()) return { ok: false, error: "empty_name" };

  const emails = parseEmailListInput(input.emailsRaw); // SAME rule the preview counted by
  if (emails.length === 0) return { ok: false, error: "no_valid_emails" };
  if (emails.length > MAX_EMAIL_LIST) return { ok: false, error: "too_many_emails" };

  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    // fail-open on identity only
  }

  // An emailList segment is a SNAPSHOT (K-40): it does not grow when new people arrive later. Stamp
  // the creation date INTO the name so it is always visible on the segment list (never inferred). The
  // screen says this; the stamp guarantees it even if the operator forgets.
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = input.name.trim();
  const name = baseName.includes(stamp) ? baseName : `${baseName} — ${stamp}`;

  const res = await saveSegment({
    name,
    stored: { criteria: EMPTY_CRITERIA, masterFilterExpr: null, emailList: emails },
    createdBy: email,
  });
  return { ok: res.ok, error: res.error, segmentId: res.id };
}

export interface EmailListPreview {
  ok: true;
  read: number; // unique valid addresses provided
  matched: number; // in the pool → will be recipients
  notInPool: number; // not in the pool → will NOT be sent (import them first)
  suppressed: number; // in the pool but on the stop-list → matched, but won't be sent
}
type PreviewResult = EmailListPreview | { ok: false; error: string };

/**
 * Preview a manual email-list BEFORE saving (K-40 honesty): show how many addresses were read, how
 * many are in the pool (recipients), how many are NOT (import them first), and how many are
 * suppressed. Read-only; audited as a parameterized list read (counts only, never the addresses).
 * Reuses resolveEmailListRecipients — the SAME resolver the send path uses — so the preview can never
 * promise a recipient the send would drop.
 */
export async function previewEmailListAction(input: { emails: string[] }): Promise<PreviewResult> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  const emails = Array.isArray(input.emails) ? input.emails : [];
  if (emails.length === 0) return { ok: false, error: "no_valid_emails" };
  if (emails.length > MAX_EMAIL_LIST) return { ok: false, error: "too_many_emails" };

  const admin = createAdminClient();
  let read: number, matched: number, notInPool: number, suppressed: number;
  try {
    const { recipients, unresolved } = await resolveEmailListRecipients(admin, emails);
    const suppressedIds = await fetchSuppressedCustomerIds(admin);
    matched = recipients.length;
    notInPool = unresolved.length;
    read = matched + notInPool;
    suppressed = recipients.filter((r) => suppressedIds.has(r.customerId)).length;
  } catch (e) {
    logApiFailure("/segments/email-list-preview", "preview_failed", { code: (e as { code?: string })?.code });
    return { ok: false, error: "preview_failed" };
  }

  // Audit — parameterized read. COUNTS ONLY; the addresses (PII) are never stored.
  try {
    const { data } = await createClient().auth.getUser();
    await admin.from("crm_audit_log").insert({
      actor_id: data.user?.id ?? null,
      actor_email: data.user?.email ?? null,
      action: "list.viewed",
      target_table: "master_customer",
      summary: `Pratinjau segmen daftar-email: ${read} dibaca, ${matched} di pool, ${notInPool} tidak, ${suppressed} ter-suppress.`,
      metadata: { view: "email_list_preview", read, matched, not_in_pool: notInPool, suppressed },
    });
  } catch {
    // A preview must not fail because the audit write hiccuped — it surfaces no PII and writes nothing.
  }

  return { ok: true, read, matched, notInPool, suppressed };
}

export interface EmailCsvParse {
  ok: true;
  headers: string[];
  column: string | null; // chosen email column (guessed or given); null → caller must pick
  guessed: string | null;
  emails: string[]; // extracted + normalised from `column` (empty when column is null)
  rowCount: number;
}
type CsvParseResult = EmailCsvParse | { ok: false; error: string };

/**
 * Parse an uploaded CSV for a manual email-list segment, via the ONE shared parser (parseCsvText,
 * T-73) — no second parser. Guesses the email column with the SAME guessColumnMapping the import uses;
 * when the file has >1 column and none can be guessed, returns needsColumn (column=null) so the client
 * shows a picker. Extraction + normalisation go through parseEmailListInput (same rule as paste/save).
 */
export async function parseEmailCsvAction(input: { csvText: string; emailColumn?: string }): Promise<CsvParseResult> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  const { headers, rows } = parseCsvText(input.csvText ?? "");
  if (headers.length === 0 || rows.length === 0) return { ok: false, error: "empty_file" };

  const mapping = guessColumnMapping(headers);
  const guessed = Object.keys(mapping).find((h) => mapping[h] === "email") ?? null;
  const column =
    input.emailColumn && headers.includes(input.emailColumn) ? input.emailColumn : guessed;
  if (!column) return { ok: true, headers, column: null, guessed, emails: [], rowCount: rows.length };

  const emails = parseEmailListInput(rows.map((r) => r[column] ?? "").join("\n"));
  return { ok: true, headers, column, guessed, emails, rowCount: rows.length };
}

/** Soft-delete a saved segment (sets is_active = false). Gate: segment.build. */
export async function deleteSegmentAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("crm_segment")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.code ?? "update_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "threw" };
  }
}
