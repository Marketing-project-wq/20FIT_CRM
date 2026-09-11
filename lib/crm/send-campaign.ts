import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRestrictIds, applyMasterCriteria } from "./segment-read";
import { normalizeEmail } from "./normalize";
import { renderEmailDocument } from "./email-document";
import { fetchSuppressedCustomerIds } from "./contactability-read";
import { EMAIL_IN_CHUNK } from "./email-list";
import type { SegmentCriteria } from "./segment";
import { renderTemplate } from "./template";
import { signUnsubscribeToken, unsubscribeSecret } from "./unsubscribe-token";
import { hashIdentity, identityHashSecret } from "./identity-hash";
import { sendTransactionalEmail, sendTransactionalEmailBatch, supportsBatchSend } from "@/lib/email/send";
import { logApiFailure } from "./failure-log";
import { SEND_ACTION } from "./send-constants";
import { realSendEnabled, maySendTo } from "./send-gate";
import {
  runSend,
  DEFAULT_SEND_CONFIG,
  emptySendFailureCounts,
  totalFailed,
  type SendPorts,
  type SendRecipient,
  type RenderedMessage,
  type RecordOutcome,
  type SendSummary,
  type SendConfig,
  type BatchSendResult,
} from "./send-run";
import { campaignBounceStatus } from "./bounce-monitor";

/**
 * Server adapter that wires the pure send engine (lib/crm/send-run.ts) to Supabase + Mailtrap. It
 * owns the I/O; the engine owns the rules. NOTHING sends to a real customer until CAMPAIGN_SEND_ENABLED
 * is flipped (send-gate) — until then only internal @20fit.id addresses go out, and customer
 * recipients are WITHHELD (not sent, not logged), reported as a count. The two blocking prerequisites
 * (rotate the leaked Mailtrap token; set SPF/DKIM/DMARC) live in RENCANA-batas-kirim / MENUNGGU.
 *
 * ONE audit row per run (SEND_ACTION = campaign.sent, compliance-retained), never per recipient —
 * like export.performed records a count. Per-recipient detail is in crm_message_log.
 */

const PAGE = 1000;

export interface CampaignSendInput {
  campaignId: string; // stable send-run id → deterministic idempotency (resume-safe)
  criteria: SegmentCriteria;
  masterFilterExpr: string | null;
  templateKey: string;
  actorId: string;
  actorEmail: string | null;
  /** true once the operator confirmed a >500-recipient send (enforced at the action layer). */
  confirmedLargeSend: boolean;
  config?: SendConfig;
  /**
   * INTERNAL-TEST ONLY (send-test-harness): inject the recipient list directly instead of resolving
   * it from master_customer. This is the ONE thing the harness must differ on — the pool holds no
   * @20fit.id address, so there is nothing to resolve — while everything downstream (ports, engine,
   * gate, audit) stays the exact production path. The pre-launch gate (maySendTo) still applies to
   * these recipients, so an injected non-internal address is still WITHHELD while sending is off.
   */
  overrideRecipients?: RawRecipient[];
}

export interface CampaignSendResult {
  recipientTotal: number; // people in the segment with a usable email
  noContact: number; // in the segment but no email_normalized → cannot email
  withheldPrelaunch: number; // customer addresses withheld because real sending is OFF
  summary: SendSummary;
  auditOk: boolean;
  realSend: boolean;
}

interface LoadedTemplate {
  version: number;
  subject: string | null;
  body: string;
  /** Per-template sender display name (T-74). null when unset → the send falls back to the Mailtrap
   *  client's default "20FIT CRM". SELECTED here — if this column is dropped from the select, the
   *  full-chain test (send-campaign-sender.test.ts) goes red. */
  senderName: string | null;
}

/** Highest-version email template per language for a key. Returns {} if none is active. Exported so
 *  the full-chain sender-name test can read the SAME row the send path reads (no per-layer stub). */
export async function loadTemplates(
  admin: SupabaseClient,
  templateKey: string,
): Promise<Record<"id" | "en", LoadedTemplate | undefined>> {
  const { data, error } = await admin
    .from("crm_message_template")
    .select("language, version, subject, body, sender_name")
    .eq("template_key", templateKey)
    .eq("channel", "email")
    .eq("is_active", true)
    .order("version", { ascending: false });
  if (error) throw error;
  const out: Record<"id" | "en", LoadedTemplate | undefined> = { id: undefined, en: undefined };
  for (const row of (data ?? []) as { language: "id" | "en"; version: number; subject: string | null; body: string; sender_name: string | null }[]) {
    if (!out[row.language]) out[row.language] = { version: row.version, subject: row.subject, body: row.body, senderName: row.sender_name };
  }
  return out;
}

interface RawRecipient {
  customerId: string;
  email: string;
  language: "id" | "en";
}

export interface EmailListResolution {
  recipients: RawRecipient[]; // addresses matched to a real master_customer uuid
  unresolved: string[];       // addresses NOT in the pool → cannot be a campaign recipient
}

/**
 * Resolve a manual email-list segment to REAL recipients — every campaign recipient MUST carry a
 * real master_customer.customer_id (a uuid), because crm_message_log.customer_id AND
 * crm_suppression.customer_id are both `uuid`. A synthetic id (e.g. "manual:<email>") cannot be
 * inserted (the send throws `invalid input syntax for type uuid`) and, even if it could, its
 * unsubscribe link would have no uuid to write to crm_suppression — the recipient could never opt
 * out. So a manual email list means "these specific people who are already in the audience pool":
 * each address is looked up by email_normalized; matches become recipients, and addresses NOT in the
 * pool are returned as `unresolved` so the caller can REJECT the send before a run is created,
 * naming them (internal test addresses belong in the crm_test_recipient / Send-test path, not here).
 * Deduped by normalised email.
 */
export async function resolveEmailListRecipients(
  admin: SupabaseClient,
  emails: string[],
): Promise<EmailListResolution> {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }
  if (normalized.length === 0) return { recipients: [], unresolved: [] };

  const byEmail = new Map<string, string>(); // email_normalized → customer_id
  // URL-safe chunk (EMAIL_IN_CHUNK=300), NOT PAGE=1000: 1.000 emails in one `.in()` builds a ~30 KB
  // URL the gateway rejects (T-69). 300 keeps every request under the ~24 KB limit.
  for (let i = 0; i < normalized.length; i += EMAIL_IN_CHUNK) {
    const chunk = normalized.slice(i, i + EMAIL_IN_CHUNK);
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id, email_normalized")
      .in("email_normalized", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as { customer_id: string; email_normalized: string | null }[]) {
      if (row.email_normalized && !byEmail.has(row.email_normalized)) {
        byEmail.set(row.email_normalized, String(row.customer_id));
      }
    }
  }

  const recipients: RawRecipient[] = [];
  const unresolved: string[] = [];
  for (const email of normalized) {
    const customerId = byEmail.get(email);
    // Language default 'id' — master_customer carries no per-person comm language yet (hanging item).
    if (customerId) recipients.push({ customerId, email, language: "id" });
    else unresolved.push(email);
  }
  return { recipients, unresolved };
}

/** Page master_customer for the segment, collecting recipients that have a usable canonical email.
 *  Suppression is NOT applied here — it is checked at send (per the binding rule). */
async function resolveRecipients(
  admin: SupabaseClient,
  criteria: SegmentCriteria,
  masterFilterExpr: string | null,
): Promise<{ recipients: RawRecipient[]; noContact: number }> {
  const restrictIds = await resolveRestrictIds(admin, criteria);
  const recipients: RawRecipient[] = [];
  let noContact = 0;

  const collect = (rows: { customer_id: string; email_normalized: string | null }[]) => {
    for (const row of rows) {
      const email = row.email_normalized;
      if (!email) {
        noContact++;
        continue;
      }
      // Language default 'id' — master_customer carries no per-person comm language yet (hanging item).
      recipients.push({ customerId: String(row.customer_id), email, language: "id" });
    }
  };

  if (restrictIds && restrictIds.size === 0) return { recipients, noContact };

  for (let from = 0; ; from += PAGE) {
    let q = admin
      .from("master_customer")
      .select("customer_id, email_normalized")
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE - 1);
    q = applyMasterCriteria(q, criteria, masterFilterExpr);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as { customer_id: string; email_normalized: string | null }[];
    const inSet = restrictIds ? rows.filter((r) => restrictIds.has(String(r.customer_id))) : rows;
    collect(inSet);
    if (rows.length < PAGE) break;
  }
  return { recipients, noContact };
}

function startOfTodayIso(nowIso: string): string {
  return `${nowIso.slice(0, 10)}T00:00:00.000Z`;
}

/**
 * How many emails were ACCEPTED by the provider today — the daily ceiling's true unit (T-43/T-44,
 * owner option (a)). Counts rows whose `sent_at` falls in today's window, NOT `status='sent'`:
 *
 *  - `sent_at` is stamped ONCE, the moment the provider returns 2xx, and is never cleared. A webhook
 *    later flips the row `sent → delivered` (or `→ bounced`), which a `status='sent'` filter would
 *    drop — so a second same-day run re-read `alreadyToday` as near-zero and re-spent the whole
 *    ceiling (T-44: 98,4% of a day's sends vanished from the count). `sent_at` survives every later
 *    transition, so the count is stable.
 *  - A FAILED send has no `sent_at` (the 'sent' branch never ran), so failures are correctly excluded
 *    — they consumed no provider quota. This closes the T-43 mismatch (the ceiling limited successes
 *    while the counter watched a transient status) in the SAME predicate: one field, `sent_at`, is
 *    both "really sent" and "counts against the shared quota".
 *
 * `.gte("sent_at", …)` is null-safe: a null `sent_at` fails the comparison and is excluded, so no
 * separate not-null clause is needed. Throws on a read error — a ceiling read that silently returns 0
 * would hand back the entire budget (fail-loud, never fail-open on a brake).
 */
export async function countSentToday(admin: SupabaseClient, nowIso: string): Promise<number> {
  const { count, error } = await admin
    .from("crm_message_log")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", startOfTodayIso(nowIso));
  if (error) throw error;
  return count ?? 0;
}

export interface CampaignPreview {
  matched: number; // profiles meeting the criteria (with or without email)
  withEmail: number; // of those, how many have a usable canonical email
  noContact: number; // matched but no email → cannot be emailed
  suppressed: number; // of the with-email set, how many are currently suppressed (skipped at send)
  sendable: number; // withEmail − suppressed → the number that would actually be emailed
  remainingDailyBudget: number; // dailyLimit − already sent today (from the log)
  unresolved: string[]; // manual email-list addresses NOT in the pool → cannot be a recipient
}

/**
 * Count what a send WOULD do, using the SAME resolution + suppression the real send uses — so the
 * number the form shows can't differ from what the send targets for any reason but timing. `nowIso`
 * fixes the daily-window read. No email is sent.
 */
export async function previewCampaign(
  input: { criteria: SegmentCriteria; masterFilterExpr: string | null; dailyLimit?: number; emailList?: string[] },
  nowIso: string,
): Promise<CampaignPreview> {
  const admin = createAdminClient();
  const isEmailList = !!(input.emailList && input.emailList.length > 0);
  const [{ recipients, noContact, unresolved }, suppressed] = await Promise.all([
    isEmailList
      ? resolveEmailListRecipients(admin, input.emailList as string[]).then((r) => ({
          recipients: r.recipients,
          noContact: 0,
          unresolved: r.unresolved,
        }))
      : resolveRecipients(admin, input.criteria, input.masterFilterExpr).then((r) => ({
          ...r,
          unresolved: [] as string[],
        })),
    fetchSuppressedCustomerIds(admin),
  ]);
  const suppressedCount = recipients.reduce((n, r) => (suppressed.has(r.customerId) ? n + 1 : n), 0);
  const withEmail = recipients.length;
  // Same sent_at-based count as the run budget (T-43/T-44): the number the form promises must equal
  // what the run enforces. Tolerant here (preview only) — a count error shows full budget rather than
  // failing the whole preview, exactly as before.
  const sentToday = await countSentToday(admin, nowIso).catch(() => 0);
  const dailyLimit = input.dailyLimit ?? DEFAULT_SEND_CONFIG.dailyLimit;
  return {
    matched: withEmail + noContact,
    withEmail,
    noContact,
    suppressed: suppressedCount,
    sendable: withEmail - suppressedCount,
    remainingDailyBudget: Math.max(0, dailyLimit - sentToday),
    unresolved,
  };
}

/**
 * Send a campaign to a segment. `nowIso` is supplied by the caller (route) so the audit + daily
 * window are deterministic and testable, matching the export path.
 */
export async function sendCampaign(input: CampaignSendInput, nowIso: string): Promise<CampaignSendResult> {
  const admin = createAdminClient();
  const config = input.config ?? DEFAULT_SEND_CONFIG;
  const enabled = realSendEnabled();

  // Recipients come from master_customer in production; the internal-test harness injects exactly one
  // instead (the pool has no @20fit.id address to resolve — see send-test-constants). Everything after
  // this line is identical for both, so the harness exercises the real path, not a copy.
  const [{ recipients: raw, noContact }, templates, suppressed] = await Promise.all([
    input.overrideRecipients
      ? Promise.resolve({ recipients: input.overrideRecipients, noContact: 0 })
      : resolveRecipients(admin, input.criteria, input.masterFilterExpr),
    loadTemplates(admin, input.templateKey),
    fetchSuppressedCustomerIds(admin),
  ]);

  // Pre-launch gate: while real sending is OFF, WITHHOLD customer addresses (send only to internal).
  const sendable: RawRecipient[] = [];
  let withheldPrelaunch = 0;
  for (const r of raw) {
    if (maySendTo(r.email, enabled)) sendable.push(r);
    else withheldPrelaunch++;
  }

  const identitySecret = identityHashSecret();
  const unsubSecret = unsubscribeSecret();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.20fit.id").replace(/\/$/, "");

  const engineRecipients: SendRecipient[] = sendable.map((r) => ({
    customerId: r.customerId,
    channel: "email",
    identityKind: "email",
    destination: r.email,
    language: r.language,
  }));

  const hashIdentityFor = (r: SendRecipient) =>
    hashIdentity(r.identityKind, r.destination, identitySecret);

  const ports: SendPorts = {
    // SUPPRESSION STALENESS BOUND: the suppressed set is snapshotted ONCE here, at the START of the
    // send run (not when the segment was counted). So the maximum staleness is exactly ONE RUN'S
    // DURATION — an unsubscribe that lands after this snapshot but before the run finishes is caught
    // on the NEXT run. That window is bounded, not open-ended: the daily limit caps a run at
    // `config.dailyLimit` sends (default 1,000), sent sequentially, so a run is minutes, not hours.
    // Stated, not left implicit (RENCANA-message-log "Batas keusangan suppression").
    async isSuppressed(customerId) {
      return suppressed.has(customerId);
    },
    async claim(key, meta) {
      // template_key/version are stamped AT CLAIM so "what this person actually received" is
      // answerable years later (the column's whole purpose). The key is known up front; the version
      // is the one that will render for this recipient's language (templates loaded above). Filling
      // it here covers BOTH the real campaign path and the internal harness (shared adapter) — the
      // harness previously left it NULL.
      const tplForRow = templates[meta.language] ?? templates.id ?? templates.en;
      const { error } = await admin.from("crm_message_log").insert({
        idempotency_key: key,
        customer_id: meta.customerId,
        channel: meta.channel,
        campaign_id: meta.campaignId,
        identity_hash: meta.identityHash,
        language: meta.language,
        template_key: input.templateKey,
        template_version: tplForRow?.version ?? null,
        status: "queued",
      });
      if (!error) return true;
      // 23505 = unique_violation → a row already exists for this recipient (prior run). Skip.
      if (error.code === "23505") return false;
      throw error;
    },
    async render(r) {
      const tpl = templates[r.language] ?? templates.id ?? templates.en;
      if (!tpl) throw new Error(`No active email template for key "${input.templateKey}".`);
      const token = signUnsubscribeToken({ customerId: r.customerId, kind: "email" }, unsubSecret);
      const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
      const values = { unsubscribe_url: unsubscribeUrl };
      // Compose the email through the shared skeleton: an HTML template is sent VERBATIM (never
      // <br/>-mangled — that was T-37, the desktop-Gmail mess), a fragment/plain body is wrapped in
      // the bulletproof 600px table frame. Same function the composer preview uses (one rule).
      const renderedBody = renderTemplate(tpl.body, values);
      const { html, text } = renderEmailDocument(renderedBody, unsubscribeUrl);
      const message: RenderedMessage = {
        subject: tpl.subject,
        text,
        html,
        unsubscribeUrl,
        templateKey: input.templateKey,
        templateVersion: tpl.version,
      };
      return message;
    },
    async send(r, message) {
      // Mailtrap's documented success body carries `message_ids`; the client returns the first one
      // (SendReceipt). Storing the provider's own id makes webhook correlation reliable instead of
      // depending on a hashed-address match. It is null only if the body lacks an id.
      // T-74: pass the template's sender name (same tpl lookup as render); null → client default.
      const tpl = templates[r.language] ?? templates.id ?? templates.en;
      const receipt = await sendTransactionalEmail(
        { to: r.destination, subject: message.subject ?? "", text: message.text, html: message.html },
        "crm-campaign",
        tpl?.senderName ?? undefined,
      );
      return { providerMessageId: receipt.providerMessageId };
    },
    // BATCH port (11 Sep 2026) — offered ONLY when the active provider has a batch endpoint, so a
    // rollback to EMAIL_PROVIDER=mailtrap silently returns the engine to one-at-a-time sending rather
    // than failing. The engine treats an absent port as "no batching", so this is a safe conditional.
    ...(supportsBatchSend()
      ? {
          // ONE Resend request carries ONE `from` line, but the sender name is per-template-LANGUAGE
          // (T-74) — so recipients may only share a request when their sender name matches. Declaring
          // that here lets the ENGINE bucket by it, which is what keeps every sendBatch call below a
          // single request. Doing the split inside sendBatch instead would force it to report partial
          // failures, and a partial failure silently disables both the backoff and the one-by-one
          // isolation (they only run when the call THROWS, which a partly-succeeded call must not do).
          batchGroupKey(r: SendRecipient) {
            const tpl = templates[r.language] ?? templates.id ?? templates.en;
            return tpl?.senderName ?? "";
          },
          async sendBatch(items: readonly { recipient: SendRecipient; message: RenderedMessage }[]) {
            // Homogeneous by construction (see batchGroupKey), so this is ONE request and any failure
            // is a WHOLE-request failure — which is exactly what the engine's recovery paths expect.
            const first = items[0];
            const senderName = first ? (templates[first.recipient.language] ?? templates.id ?? templates.en)?.senderName : null;
            const receipts = await sendTransactionalEmailBatch(
              items.map((it: { recipient: SendRecipient; message: RenderedMessage }) => ({
                to: it.recipient.destination,
                subject: it.message.subject ?? "",
                text: it.message.text,
                html: it.message.html,
              })),
              "crm-campaign",
              senderName ?? undefined,
            );
            return items.map((_, i: number): BatchSendResult => ({
              ok: true,
              providerMessageId: receipts[i]?.providerMessageId ?? null,
            }));
          },
        }
      : {}),
    async record(key, outcome: RecordOutcome) {
      const patch: Record<string, unknown> = { status: outcome.status };
      if (outcome.status === "sent") {
        patch.provider_message_id = outcome.providerMessageId;
        patch.sent_at = nowIso;
      } else if (outcome.status === "bounced" || outcome.status === "failed") {
        patch.failure_cause = outcome.failureCause;
        // error_message holds the PII-free CODE only (HTTP status, or a network code like
        // ECONNRESET) — produced by sendFailureCode, shape-checked there. Never provider prose,
        // never any part of the response body: crm_message_log stores no readable contact, and a
        // provider body can echo the recipient address (see lib/email/mailtrap.ts).
        patch.error_message = outcome.code == null ? null : String(outcome.code);
        if (outcome.status === "bounced") patch.bounced_at = nowIso;
      }
      const { error } = await admin.from("crm_message_log").update(patch).eq("idempotency_key", key);
      if (error) logApiFailure("/campaigns", "log_update_failed", { code: error.code });
    },
    async todaySentCount() {
      // T-43/T-44: count provider-accepted rows by sent_at (stable across webhook transitions), so a
      // second same-day run sees the real total already sent — not a count deflated by delivered/bounced.
      return countSentToday(admin, nowIso);
    },
    // Rules 8 & 9: the real clock. In the engine's tests this is a recording no-op; here it is the
    // actual pause that backoff and pacing depend on.
    async sleep(ms) {
      if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };

  // PRE-RUN bounce guard (5% auto-stop, activated 31 Aug 2026). Hard bounces mostly land LATER via
  // the Mailtrap webhook, so the in-run stop (runSend rule 6) can't see them; this reads the
  // accumulated, webhook-filled bounces for THIS run and refuses to START the next pass if the ratio
  // has crossed 5% over a sufficient sample. A fresh run has 0 prior attempts → dataSufficient false
  // → never pre-halted; the guard only bites on a resume of a run that is already bouncing badly.
  const preRunBounce = await campaignBounceStatus(admin, input.campaignId);
  const summary: SendSummary = preRunBounce.stop
    ? {
        attempted: 0,
        sent: 0,
        skippedSuppressed: 0,
        skippedAlreadySent: 0,
        failed: emptySendFailureCounts(),
        deferredDailyLimit: 0,
        stoppedHighBounce: true,
        stoppedConsecutiveFailures: false,
        retriedSends: 0,
        haltedForBatch: false,
      }
    : await runSend(engineRecipients, ports, input.campaignId, hashIdentityFor, config);

  // ONE audit row per run — PII-free counts only (SEND_ACTION → compliance / permanent).
  let auditOk = true;
  try {
    const { error } = await admin.from("crm_audit_log").insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      action: SEND_ACTION,
      target_table: "crm_message_log",
      summary: `Kirim kampanye (terkirim ${summary.sent}, dilewati ${summary.skippedSuppressed}, gagal ${totalFailed(summary.failed)}).`,
      metadata: {
        campaign_id: input.campaignId,
        template_key: input.templateKey,
        channel: "email",
        recipient_total: raw.length,
        no_contact: noContact,
        withheld_prelaunch: withheldPrelaunch,
        real_send: enabled,
        sent: summary.sent,
        skipped_suppressed: summary.skippedSuppressed,
        skipped_already_sent: summary.skippedAlreadySent,
        deferred_daily_limit: summary.deferredDailyLimit,
        stopped_high_bounce: summary.stoppedHighBounce,
        stopped_consecutive_failures: summary.stoppedConsecutiveFailures,
        retried_sends: summary.retriedSends,
        failed: summary.failed,
        failed_total: totalFailed(summary.failed),
      },
    });
    if (error) {
      auditOk = false;
      logApiFailure("/campaigns", "audit_write_failed", { code: error.code });
    }
  } catch (e) {
    auditOk = false;
    logApiFailure("/campaigns", "audit_write_threw", { code: (e as { code?: string })?.code });
  }

  return {
    recipientTotal: raw.length,
    noContact,
    withheldPrelaunch,
    summary,
    auditOk,
    realSend: enabled,
  };
}
