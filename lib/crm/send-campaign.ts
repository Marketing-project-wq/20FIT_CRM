import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRestrictIds, applyMasterCriteria } from "./segment-read";
import { normalizeEmail } from "./normalize";
import { fetchSuppressedCustomerIds } from "./contactability-read";
import type { SegmentCriteria } from "./segment";
import { renderTemplate } from "./template";
import { signUnsubscribeToken, unsubscribeSecret } from "./unsubscribe-token";
import { hashIdentity, identityHashSecret } from "./identity-hash";
import { sendTransactionalEmail } from "@/lib/email/mailtrap";
import { logApiFailure } from "./failure-log";
import { SEND_ACTION } from "./send-constants";
import { realSendEnabled, maySendTo } from "./send-gate";
import {
  runSend,
  DEFAULT_SEND_CONFIG,
  type SendPorts,
  type SendRecipient,
  type RenderedMessage,
  type RecordOutcome,
  type SendSummary,
  type SendConfig,
} from "./send-run";

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
}

/** Highest-version email template per language for a key. Returns {} if none is active. */
async function loadTemplates(
  admin: SupabaseClient,
  templateKey: string,
): Promise<Record<"id" | "en", LoadedTemplate | undefined>> {
  const { data, error } = await admin
    .from("crm_message_template")
    .select("language, version, subject, body")
    .eq("template_key", templateKey)
    .eq("channel", "email")
    .eq("is_active", true)
    .order("version", { ascending: false });
  if (error) throw error;
  const out: Record<"id" | "en", LoadedTemplate | undefined> = { id: undefined, en: undefined };
  for (const row of (data ?? []) as { language: "id" | "en"; version: number; subject: string | null; body: string }[]) {
    if (!out[row.language]) out[row.language] = { version: row.version, subject: row.subject, body: row.body };
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
  for (let i = 0; i < normalized.length; i += PAGE) {
    const chunk = normalized.slice(i, i + PAGE);
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
  const { count } = await admin
    .from("crm_message_log")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", startOfTodayIso(nowIso));
  const dailyLimit = input.dailyLimit ?? DEFAULT_SEND_CONFIG.dailyLimit;
  return {
    matched: withEmail + noContact,
    withEmail,
    noContact,
    suppressed: suppressedCount,
    sendable: withEmail - suppressedCount,
    remainingDailyBudget: Math.max(0, dailyLimit - (count ?? 0)),
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
      const text = renderTemplate(tpl.body, values);
      const html = `<div>${renderTemplate(tpl.body, values).replace(/\n/g, "<br/>")}</div>`;
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
      const receipt = await sendTransactionalEmail(
        { to: r.destination, subject: message.subject ?? "", text: message.text, html: message.html },
        "crm-campaign",
      );
      return { providerMessageId: receipt.providerMessageId };
    },
    async record(key, outcome: RecordOutcome) {
      const patch: Record<string, unknown> = { status: outcome.status };
      if (outcome.status === "sent") {
        patch.provider_message_id = outcome.providerMessageId;
        patch.sent_at = nowIso;
      } else if (outcome.status === "bounced" || outcome.status === "failed") {
        patch.failure_cause = outcome.failureCause;
        patch.error_message = outcome.code == null ? null : String(outcome.code);
        if (outcome.status === "bounced") patch.bounced_at = nowIso;
      }
      const { error } = await admin.from("crm_message_log").update(patch).eq("idempotency_key", key);
      if (error) logApiFailure("/campaigns", "log_update_failed", { code: error.code });
    },
    async todaySentCount() {
      const { count, error } = await admin
        .from("crm_message_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", startOfTodayIso(nowIso));
      if (error) throw error;
      return count ?? 0;
    },
  };

  const summary = await runSend(engineRecipients, ports, input.campaignId, hashIdentityFor, config);

  // ONE audit row per run — PII-free counts only (SEND_ACTION → compliance / permanent).
  let auditOk = true;
  try {
    const { error } = await admin.from("crm_audit_log").insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail,
      action: SEND_ACTION,
      target_table: "crm_message_log",
      summary: `Kirim kampanye (terkirim ${summary.sent}, dilewati ${summary.skippedSuppressed}, gagal ${
        summary.failed.invalid_address + summary.failed.hard_bounce + summary.failed.provider_rejected + summary.failed.unknown
      }).`,
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
        failed: summary.failed,
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
