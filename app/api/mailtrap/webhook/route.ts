import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/crm/normalize";
import { hashIdentity, identityHashSecret } from "@/lib/crm/identity-hash";
import { logApiFailure } from "@/lib/crm/failure-log";
import {
  verifyWebhookSignature,
  readSignatureHeader,
  isEventTooOld,
  parseWebhookEvents,
  mapWebhookEvent,
  type WebhookEvent,
} from "@/lib/crm/mailtrap-webhook";

export const dynamic = "force-dynamic";

/**
 * Mailtrap delivery webhook → fills crm_message_log cycle columns (delivered/bounced/complained/…).
 *
 * UNTRUSTED INPUT. The body is verified (HMAC over the RAW bytes) BEFORE anything is parsed or
 * written; an unverified request gets 401 and touches nothing (see the CVE-2026-45755 note in
 * lib/crm/mailtrap-webhook.ts — verification is the ONLY thing separating this from that
 * suppression-poisoning CVE; never remove it). Both `Mailtrap-Signature` and `X-Mt-Signature` are
 * read. 401 (not 500) on a bad signature is deliberate: 200 makes Mailtrap consider it delivered and
 * stop retrying; 500 makes it RETRY a possibly-malicious payload. Only cycle timestamp columns (+ a
 * terminal status / failure_cause) are ever written — never message content. Correlation is by the
 * provider's own id first (provider_message_id), falling back to identity_hash. An event we can't
 * map or can't correlate is skipped, not guessed. MAILTRAP_WEBHOOK_SECRET unset → every request is
 * rejected (safe default while the endpoint exists but sending is still pre-launch).
 *
 * ANTI-REPLAY: an HMAC-valid payload can be re-sent. Events older than the window are skipped, and
 * every column is filled ONLY when currently NULL (a re-sent event updates 0 rows), so a replayed
 * bounce cannot inflate the auto-stop ratio and a late `delivered` cannot overwrite a bounce.
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const signature = readSignatureHeader((name) => req.headers.get(name));
  const secret = process.env.MAILTRAP_WEBHOOK_SECRET ?? null;

  if (!verifyWebhookSignature(raw, signature, secret)) {
    // No PII, no body echo — just the fact that verification failed.
    logApiFailure("/api/mailtrap/webhook", "signature_rejected", { status: 401 });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let events: WebhookEvent[];
  try {
    events = parseWebhookEvents(JSON.parse(raw));
  } catch {
    logApiFailure("/api/mailtrap/webhook", "bad_json", { status: 400 });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowMs = Date.now();
  let updated = 0;
  let skippedStale = 0;
  let hashSecret: string | null = null;
  try {
    hashSecret = identityHashSecret();
  } catch {
    hashSecret = null; // fall back to message-id-only correlation
  }

  for (const ev of events) {
    const effect = mapWebhookEvent(ev.event);
    if (!effect) continue; // transient/unknown — ignored, never a status change on a guess

    // Anti-replay: an old (replayed) event is skipped before it can touch the row.
    if (isEventTooOld(ev.timestampIso, nowMs)) {
      skippedStale++;
      continue;
    }

    const ts = ev.timestampIso ?? new Date().toISOString();
    const patch: Record<string, unknown> = { [effect.column]: ts };
    if (effect.status) patch.status = effect.status;
    if (effect.failureCause) patch.failure_cause = effect.failureCause;

    try {
      let q = admin.from("crm_message_log").update(patch);
      // Idempotent fill: only set this cycle column when it is still NULL. A re-sent (replayed) event
      // matches 0 rows, so it can never double-count for the bounce auto-stop or overwrite a value.
      q = q.is(effect.column, null);
      // A late `delivered` must not overwrite a terminal bad status (out-of-order / replay guard).
      if (effect.status === "delivered") q = q.not("status", "in", '("bounced","complained")');
      if (ev.messageId) {
        q = q.eq("provider_message_id", ev.messageId);
      } else if (ev.email && hashSecret) {
        const norm = normalizeEmail(ev.email);
        if (!norm) continue;
        q = q.eq("identity_hash", hashIdentity("email", norm, hashSecret));
      } else {
        continue; // nothing to correlate on
      }
      const { data, error } = await q.select("id");
      if (error) {
        logApiFailure("/api/mailtrap/webhook", "log_update_failed", { code: error.code });
        continue;
      }
      updated += data?.length ?? 0;
    } catch (e) {
      logApiFailure("/api/mailtrap/webhook", "update_threw", { code: (e as { code?: string })?.code });
    }
  }

  return NextResponse.json({ ok: true, updated, skippedStale });
}
