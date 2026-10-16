import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/crm/normalize";
import { correctEmailDomain } from "@/lib/crm/email-domain-correct";
import { fetchSuppressedCustomerIds } from "@/lib/crm/contactability-read";
import { realSendEnabled, maySendTo } from "@/lib/crm/send-gate";
import { hashIdentity, identityHashSecret } from "@/lib/crm/identity-hash";
import { signUnsubscribeToken, unsubscribeSecret } from "@/lib/crm/unsubscribe-token";
import { sendTransactionalEmail } from "@/lib/email/send";
import { EMAIL_IN_CHUNK } from "@/lib/crm/email-list";
import { SEND_ACTION } from "@/lib/crm/send-constants";
import { logApiFailure } from "@/lib/crm/failure-log";
import { flowApi, type AckResult, type EventRow, type OutboxItem } from "./api";
import { ctxVars, renderFlowEmail } from "./email";

/**
 * One flow tick, CRM side. Called every minute by the background executor (run-scheduled, pg_cron) and
 * on demand from the builder ("Jalankan sekarang"):
 *
 *   1. EVENTS  — open/click/bounce stamps of flow emails (crm_message_log, filled by the provider
 *                webhook) are pushed to the engine so "Dibuka?" / "Diklik?" branches and stats see them.
 *   2. TICK    — the engine (c360-api) enrolls, advances and returns the emails that are due (outbox).
 *   3. SEND    — each outbox email goes through the same rules as a campaign: pool identity,
 *                suppression (G01), pre-launch gate, unsubscribe link, one crm_message_log row keyed by a
 *                deterministic idempotency key (flow:<enrollment>:<node>) so a retry never double-sends.
 *   4. ACK     — per-email outcome back to the engine, which then moves the person on.
 *
 * crm_message_log.campaign_id = "flow:<flowId>:<node>" (test: "flowtest:…") — that is how Deliveries,
 * webhooks and the flow stats tell flow sends apart from campaign runs.
 */

let running = false;

function testCustomerId(email: string): string {
  const h = createHash("sha256").update(`flowtest:${email}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function syncEvents(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const since = new Date(Date.now() - 21 * 86400_000).toISOString();
  const rows: EventRow[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await admin
      .from("crm_message_log")
      .select("idempotency_key, sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at, unsubscribed_at")
      .like("campaign_id", "flow%")
      .gte("created_at", since)
      .not("sent_at", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as Record<string, string | null>[]) {
      rows.push({
        key: r.idempotency_key as string,
        sent_at: r.sent_at, delivered_at: r.delivered_at, opened_at: r.opened_at, clicked_at: r.clicked_at,
        bounced_at: r.bounced_at, complained_at: r.complained_at, unsubscribed_at: r.unsubscribed_at,
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  if (!rows.length) return 0;
  return (await flowApi.events(rows)).updated;
}

async function resolveCustomers(admin: ReturnType<typeof createAdminClient>, emails: string[]) {
  const byEmail = new Map<string, { customerId: string; fullName: string; city: string }>();
  const uniq = Array.from(new Set(emails));
  for (let i = 0; i < uniq.length; i += EMAIL_IN_CHUNK) {
    const chunk = uniq.slice(i, i + EMAIL_IN_CHUNK);
    const { data, error } = await admin.from("master_customer").select("customer_id, email_normalized, full_name, city").in("email_normalized", chunk);
    if (error) throw error;
    for (const r of (data ?? []) as { customer_id: string; email_normalized: string | null; full_name: string | null; city: string | null }[]) {
      if (r.email_normalized && !byEmail.has(r.email_normalized)) {
        byEmail.set(r.email_normalized, { customerId: String(r.customer_id), fullName: r.full_name ?? "", city: r.city ?? "" });
      }
    }
  }
  return byEmail;
}

export interface FlowTickSummary {
  ok: boolean;
  skipped?: "already_running";
  events: number;
  enrolled: number;
  advanced: number;
  converted: number;
  sent: number;
  skippedSend: number;
  failed: number;
  errors: string[];
}

export async function runFlowTick(opts: { enroll?: boolean } = {}): Promise<FlowTickSummary> {
  const empty: FlowTickSummary = { ok: true, events: 0, enrolled: 0, advanced: 0, converted: 0, sent: 0, skippedSend: 0, failed: 0, errors: [] };
  if (running) return { ...empty, skipped: "already_running" };
  running = true;
  try {
    const admin = createAdminClient();
    const out = { ...empty };
    try {
      out.events = await syncEvents(admin);
    } catch (e) {
      out.errors.push(`events: ${(e as Error).message}`);
    }
    const t = await flowApi.tick(opts.enroll === false ? "advance" : "full");
    out.enrolled = t.enrolled;
    out.advanced = t.advanced;
    out.converted = t.converted;
    out.errors.push(...(t.errors ?? []).slice(0, 20));
    if (!t.outbox?.length) return out;

    const enabled = realSendEnabled();
    const [suppressed, byEmail] = await Promise.all([
      fetchSuppressedCustomerIds(admin),
      resolveCustomers(admin, t.outbox.map((o) => normalizeEmail(correctEmailDomain(o.email)) ?? "").filter(Boolean)),
    ]);
    const idSecret = identityHashSecret();
    const unsubSecret = unsubscribeSecret();
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.20fit.id").replace(/\/$/, "");
    const acks: AckResult[] = [];

    for (const item of t.outbox) {
      acks.push(await sendOne(admin, item, { enabled, suppressed, byEmail, idSecret, unsubSecret, baseUrl }));
    }
    for (const a of acks) {
      if (a.outcome === "sent") out.sent++;
      else if (a.outcome === "failed") out.failed++;
      else if (a.outcome !== "deferred") out.skippedSend++;
    }
    await flowApi.ack(acks);

    // ONE audit row per tick that sent anything — counts only (same family as campaign sends).
    if (out.sent + out.failed > 0) {
      const { error } = await admin.from("crm_audit_log").insert({
        actor_id: null,
        actor_email: "system:flow-engine",
        action: SEND_ACTION,
        target_table: "crm_message_log",
        summary: `Kirim flow otomatis (terkirim ${out.sent}, dilewati ${out.skippedSend}, gagal ${out.failed}).`,
        metadata: {
          source: "flow",
          real_send: enabled,
          sent: out.sent,
          skipped: out.skippedSend,
          failed: out.failed,
          flows: Array.from(new Set(t.outbox.map((o) => o.flow_id))),
        },
      });
      if (error) logApiFailure("/flows", "audit_write_failed", { code: error.code });
    }
    return out;
  } finally {
    running = false;
  }
}

async function sendOne(
  admin: ReturnType<typeof createAdminClient>,
  item: OutboxItem,
  env: {
    enabled: boolean;
    suppressed: Set<string>;
    byEmail: Map<string, { customerId: string; fullName: string; city: string }>;
    idSecret: string;
    unsubSecret: string;
    baseUrl: string;
  },
): Promise<AckResult> {
  const email = normalizeEmail(correctEmailDomain(item.email));
  if (!email) return { step_id: item.step_id, outcome: "invalid_email" };

  let customerId: string;
  let fullName = item.nama ?? "";
  let city = item.kota ?? "";
  if (item.is_test) {
    customerId = testCustomerId(email);
  } else {
    const c = env.byEmail.get(email);
    if (!c) return { step_id: item.step_id, outcome: "not_in_pool" };
    customerId = c.customerId;
    fullName = c.fullName || fullName;
    city = c.city || city;
    if (env.suppressed.has(customerId)) return { step_id: item.step_id, outcome: "skipped_suppressed" };
    if (!maySendTo(email, env.enabled)) return { step_id: item.step_id, outcome: "withheld" };
  }

  const content = (item.content ?? {}) as Record<string, unknown>;
  const token = signUnsubscribeToken({ customerId, kind: "email" }, env.unsubSecret);
  const unsubscribeUrl = `${env.baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
  const vars = {
    ...ctxVars(item.ctx),
    full_name: fullName,
    first_name: fullName.split(/\s+/)[0] || "Sobat 20FIT",
    city,
  };
  const rendered = renderFlowEmail(content, vars, { flowId: item.flow_id, node: item.node, unsubscribeUrl });
  const subject = item.is_test ? `[UJI ${item.flow_id}] ${rendered.subject}` : rendered.subject;
  const campaignId = `${item.is_test ? "flowtest" : "flow"}:${item.flow_id}:${item.node}`;

  // CLAIM — the unique idempotency key is the double-send guard (a retried tick re-offers the same key).
  const { error: claimErr } = await admin.from("crm_message_log").insert({
    idempotency_key: item.message_key,
    customer_id: customerId,
    channel: "email",
    campaign_id: campaignId,
    identity_hash: hashIdentity("email", email, env.idSecret),
    language: "id",
    template_key: campaignId,
    template_version: item.version,
    subject,
    status: "queued",
  });
  if (claimErr) {
    if (claimErr.code === "23505") {
      const { data, error: readErr } = await admin.from("crm_message_log").select("status, sent_at").eq("idempotency_key", item.message_key).maybeSingle();
      if (readErr) return { step_id: item.step_id, outcome: "deferred" };
      const row = data as { status: string; sent_at: string | null } | null;
      if (row?.sent_at) return { step_id: item.step_id, outcome: "sent", sent_at: row.sent_at };
      if (row?.status === "failed") return { step_id: item.step_id, outcome: "failed", detail: "earlier_attempt_failed" };
      return { step_id: item.step_id, outcome: "deferred" };
    }
    logApiFailure("/flows", "claim_failed", { code: claimErr.code });
    return { step_id: item.step_id, outcome: "deferred" };
  }

  try {
    // Already fully inline + table-based (lib/crm/flow/email.ts); no css-inlining pass, which would
    // also rewrite the Outlook VML button comments.
    const receipt = await sendTransactionalEmail(
      { to: email, subject, text: rendered.text, html: rendered.html },
      "crm-flow",
      rendered.senderName,
    );
    const sentAt = new Date().toISOString();
    await admin.from("crm_message_log").update({ status: "sent", provider_message_id: receipt.providerMessageId, sent_at: sentAt }).eq("idempotency_key", item.message_key);
    return { step_id: item.step_id, outcome: "sent", sent_at: sentAt };
  } catch (e) {
    const code = (e as { status?: number; code?: string })?.status ?? (e as { code?: string })?.code ?? null;
    await admin
      .from("crm_message_log")
      .update({ status: "failed", failure_cause: "unknown", error_message: code == null ? null : String(code).slice(0, 40) })
      .eq("idempotency_key", item.message_key);
    return { step_id: item.step_id, outcome: "failed", detail: code == null ? null : String(code) };
  }
}
