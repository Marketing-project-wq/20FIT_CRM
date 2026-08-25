import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMPTY_CRITERIA } from "./segment";
import { realSendEnabled, isInternalAddress } from "./send-gate";
import { sendCampaign } from "./send-campaign";
import { createRun, finalizeRunStatus, recordRunError } from "./campaign-run";
import { missingSendEnv, classifySendThrow } from "./send-env";
import { SEND_ACTION } from "./send-constants";
import {
  INTERNAL_TEST_ENV_VAR,
  INTERNAL_TEST_TEMPLATE_KEY,
  INTERNAL_TEST_SEGMENT_NAME,
  INTERNAL_TEST_CUSTOMER_ID,
} from "./send-test-constants";

/**
 * Internal send-test harness (RUNBOOK-kirim-internal-pertama). Drives the SAME engine + ports + audit
 * + gate as a real campaign — via sendCampaign — but with ONE injected internal recipient, because the
 * customer pool holds no @20fit.id address to resolve (the verified deadlock). It seeds the two
 * composer prerequisites (a test template + a test segment), opens a crm_campaign_run, sends, and
 * reports the real artifacts so what's proven is the chain, not the harness.
 *
 * Three guards make it safe and non-backdoor:
 *   1. Runs ONLY while CAMPAIGN_SEND_ENABLED is off (safe mode). Once real sending is live it refuses,
 *      so it can never become a way to send to arbitrary addresses.
 *   2. Destination comes from env (never hardcoded) and MUST be @20fit.id, else it refuses.
 *   3. The send itself still passes through maySendTo — a non-internal address is withheld anyway.
 */

export type SendTestFailure =
  | "real_send_enabled" // CAMPAIGN_SEND_ENABLED=true → refuse (not a backdoor)
  | "no_target_configured" // SEND_TEST_INTERNAL_ADDRESS unset
  | "target_not_internal" // env target is not an @20fit.id address
  | "missing_env" // one or more required send vars unset — ALL reported at once (see missingEnv)
  | "unsubscribe_host_mismatch" // unsubscribe link host ≠ serving host → dead link, refuse
  | "template_seed_failed"
  | "segment_seed_failed"
  | "run_create_failed"
  | "send_threw"; // sendCampaign threw; the run is marked stopped + last_error (see detail)

export interface SendTestLogRow {
  status: string;
  providerMessageId: string | null;
  customerId: string;
  templateVersion: number | null;
  failureCause: string | null;
  sentAt: string | null;
}

export interface SendTestResult {
  ok: boolean;
  error?: SendTestFailure;
  missingEnv?: string[]; // on 'missing_env': the FULL list of missing required vars, not just the first
  detail?: string; // on 'send_threw': the PII-free classified cause (also written to run.last_error)
  linkHost?: string | null; // on 'unsubscribe_host_mismatch'
  servingHost?: string | null; // on 'unsubscribe_host_mismatch'
  // Artifacts for the 7-point report (all read back from the real tables after the send):
  targetMasked?: string; // the internal address, lightly masked for display
  runId?: string;
  runStatus?: string;
  templateKey?: string;
  templateVersion?: number;
  segmentId?: string;
  logRows?: SendTestLogRow[]; // rows in crm_message_log for THIS run
  auditCampaignSentCount?: number; // rows in crm_audit_log for THIS run's campaign.sent (want exactly 1)
  realSend?: boolean; // false in safe mode → the email really goes out only to the internal address
  summary?: {
    sent: number;
    skippedSuppressed: number;
    skippedAlreadySent: number;
    withheldPrelaunch: number;
    failed: number;
  };
}

/** Mask an email for display: keep first char + domain. Never render the full internal address. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

/** Ensure the seeded test email template exists (append-only table: insert once, reused after). It
 *  carries {{unsubscribe_url}} so it satisfies the same precondition real templates do. Returns the
 *  active version, or null on failure. */
async function ensureTestTemplate(admin: SupabaseClient): Promise<number | null> {
  const { data: existing } = await admin
    .from("crm_message_template")
    .select("version")
    .eq("template_key", INTERNAL_TEST_TEMPLATE_KEY)
    .eq("channel", "email")
    .eq("language", "id")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { version: number }).version;

  const body =
    "Ini email UJI internal 20FIT CRM — membuktikan rantai kirim ujung ke ujung.\n\n" +
    "Berhenti berlangganan: {{unsubscribe_url}}\n";
  const { data, error } = await admin
    .from("crm_message_template")
    .insert({
      template_key: INTERNAL_TEST_TEMPLATE_KEY,
      channel: "email",
      language: "id",
      version: 1,
      name: "UJI — kirim internal (data uji)",
      subject: "UJI kirim internal 20FIT CRM",
      body,
      variables: ["unsubscribe_url"],
      is_active: true,
      created_by: "send-test-harness",
    })
    .select("version")
    .single();
  if (error || !data) return null;
  return (data as { version: number }).version;
}

/** Ensure the seeded test segment exists (reused if already there, else inserted). Its criteria are
 *  irrelevant — the harness injects the recipient — but a real crm_segment row is needed because
 *  crm_campaign_run.segment_id references it (on delete restrict). Returns id, or null on failure. */
async function ensureTestSegment(admin: SupabaseClient): Promise<string | null> {
  const { data: existing } = await admin
    .from("crm_segment")
    .select("id")
    .eq("name", INTERNAL_TEST_SEGMENT_NAME)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data, error } = await admin
    .from("crm_segment")
    .insert({
      name: INTERNAL_TEST_SEGMENT_NAME,
      criteria: { criteria: EMPTY_CRITERIA, masterFilterExpr: null },
      requires_clinical: false,
      created_by: "send-test-harness",
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Run the internal send test. `actor` identifies who triggered it (for the campaign.sent audit row).
 * Returns the real artifacts read back from crm_message_log / crm_audit_log / crm_campaign_run.
 */
export async function runInternalSendTest(actor: { actorId: string; actorEmail: string | null }): Promise<SendTestResult> {
  // Guard 1: safe mode only.
  if (realSendEnabled()) return { ok: false, error: "real_send_enabled" };
  // Guard 2: destination from env, and must be internal.
  const target = (process.env[INTERNAL_TEST_ENV_VAR] ?? "").trim();
  if (!target) return { ok: false, error: "no_target_configured" };
  if (!isInternalAddress(target)) return { ok: false, error: "target_not_internal" };

  // Pre-flight: report ALL missing required send vars at once, BEFORE creating any run — so the owner
  // fixes them in one pass (not one failed attempt per missing var), and a doomed run is never created.
  const missing = missingSendEnv();
  if (missing.length > 0) {
    return { ok: false, error: "missing_env", missingEnv: missing.map((m) => m.name) };
  }

  const admin = createAdminClient();

  const templateVersion = await ensureTestTemplate(admin);
  if (templateVersion == null) return { ok: false, error: "template_seed_failed" };

  const segmentId = await ensureTestSegment(admin);
  if (!segmentId) return { ok: false, error: "segment_seed_failed" };

  const nowIso = new Date().toISOString();
  const run = await createRun({
    segmentId,
    templateKey: INTERNAL_TEST_TEMPLATE_KEY,
    label: `UJI kirim internal ${nowIso}`,
    createdBy: actor.actorEmail ?? "send-test-harness",
  });
  if (!run) return { ok: false, error: "run_create_failed" };

  // THE SAME production function — only the recipient list is injected (Guard 3: maySendTo still
  // applies to it, so a non-internal address would be withheld regardless). If it throws (e.g. a
  // secret the pre-check couldn't foresee), the run records WHY (status stopped + last_error) instead
  // of dying silently — T-30.
  let result: Awaited<ReturnType<typeof sendCampaign>>;
  try {
    result = await sendCampaign(
      {
        campaignId: run.id,
        criteria: EMPTY_CRITERIA,
        masterFilterExpr: null,
        templateKey: INTERNAL_TEST_TEMPLATE_KEY,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        confirmedLargeSend: false,
        overrideRecipients: [{ customerId: INTERNAL_TEST_CUSTOMER_ID, email: target, language: "id" }],
      },
      nowIso,
    );
  } catch (e) {
    const cause = classifySendThrow(e);
    await recordRunError(run.id, cause);
    return { ok: false, error: "send_threw", detail: cause, runId: run.id };
  }

  const runStatus = await finalizeRunStatus(run.id, {
    deferredDailyLimit: result.summary.deferredDailyLimit,
    stoppedHighBounce: result.summary.stoppedHighBounce,
  });

  // Read the artifacts back from the real tables — this is what the 7-point report cites.
  const { data: logs } = await admin
    .from("crm_message_log")
    .select("status, provider_message_id, customer_id, template_version, failure_cause, sent_at")
    .eq("campaign_id", run.id)
    .order("created_at", { ascending: true });
  const logRows: SendTestLogRow[] = (logs ?? []).map((r) => {
    const row = r as {
      status: string; provider_message_id: string | null; customer_id: string;
      template_version: number | null; failure_cause: string | null; sent_at: string | null;
    };
    return {
      status: row.status,
      providerMessageId: row.provider_message_id,
      customerId: row.customer_id,
      templateVersion: row.template_version,
      failureCause: row.failure_cause,
      sentAt: row.sent_at,
    };
  });

  const { count: auditCount } = await admin
    .from("crm_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", SEND_ACTION)
    .eq("metadata->>campaign_id", run.id);

  const failedTotal =
    result.summary.failed.invalid_address + result.summary.failed.hard_bounce +
    result.summary.failed.provider_rejected + result.summary.failed.unknown;

  return {
    ok: true,
    targetMasked: maskEmail(target),
    runId: run.id,
    runStatus,
    templateKey: INTERNAL_TEST_TEMPLATE_KEY,
    templateVersion,
    segmentId,
    logRows,
    auditCampaignSentCount: auditCount ?? 0,
    realSend: result.realSend,
    summary: {
      sent: result.summary.sent,
      skippedSuppressed: result.summary.skippedSuppressed,
      skippedAlreadySent: result.summary.skippedAlreadySent,
      withheldPrelaunch: result.withheldPrelaunch,
      failed: failedTotal,
    },
  };
}

export interface SendTestCleanupResult {
  ok: boolean;
  segmentsArchived: number; // test segments soft-deleted (is_active=false)
  note: string;
}

/**
 * Clean up removable test data: soft-delete the seeded test segment(s) (is_active=false) so they
 * leave the composer's dropdown. What CANNOT be removed and is stated plainly: the crm_message_template
 * row (table is INSERT-only for service_role by design — append-only, K-14; it stays but is hidden
 * from the composer by its sentinel key), and the append-only crm_message_log / crm_audit_log /
 * crm_campaign_run / crm_suppression rows the test produced.
 */
export async function cleanupInternalSendTest(): Promise<SendTestCleanupResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_segment")
    .update({ is_active: false })
    .eq("name", INTERNAL_TEST_SEGMENT_NAME)
    .eq("is_active", true)
    .select("id");
  const archived = error ? 0 : (data ?? []).length;
  return {
    ok: !error,
    segmentsArchived: archived,
    note:
      "Permanen (append-only, tak bisa dihapus): 1 template uji (tersembunyi dari composer via kunci sentinel), " +
      "plus baris crm_message_log / crm_audit_log / crm_campaign_run / crm_suppression yang dihasilkan uji.",
  };
}
