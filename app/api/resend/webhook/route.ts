import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/crm/normalize";
import { hashIdentity, identityHashSecret } from "@/lib/crm/identity-hash";
import { logApiFailure } from "@/lib/crm/failure-log";
import { isEventTooOld } from "@/lib/crm/mailtrap-webhook";
import {
  verifyResendSignature,
  isSvixTimestampTooOld,
  parseResendEvent,
  mapResendEvent,
  SVIX_ID_HEADER,
  SVIX_TIMESTAMP_HEADER,
  SVIX_SIGNATURE_HEADER,
} from "@/lib/crm/resend-webhook";

export const dynamic = "force-dynamic";

/**
 * Resend delivery webhook → fills crm_message_log cycle columns (delivered/bounced/complained/…). The
 * Resend twin of app/api/mailtrap/webhook/route.ts; the two run SIDE BY SIDE. Mailtrap's route stays
 * live: emails already sent through Mailtrap keep emitting events for DAYS, and killing that route
 * would strand those rows at `sent` forever (their delivered/bounced would be lost). See the deletion
 * condition at the bottom of this comment.
 *
 * UNTRUSTED INPUT. The body is verified (Svix HMAC over the RAW bytes + signed headers) BEFORE anything
 * is parsed or written; an unverified request gets 401 and touches nothing. Verification is the ONLY
 * thing separating this from a suppression-poisoning forgery (CVE-2026-45755, cited in
 * mailtrap-webhook.ts — never remove it). 401 (not 500) on a bad signature is deliberate: 200 makes
 * Resend consider it handled and stop retrying; 500 makes it RETRY a possibly-malicious payload. Only
 * cycle timestamp columns (+ a terminal status / failure_cause) are ever written — never message
 * content. Correlation is by the provider's own id first (data.email_id → provider_message_id),
 * falling back to identity_hash. An event we can't map or can't correlate is skipped, not guessed.
 * RESEND_WEBHOOK_SECRET unset → every request is rejected (safe default).
 *
 * ANTI-REPLAY: the signed `svix-timestamp` cannot be altered without breaking the signature, so a
 * too-old timestamp is rejected; and every column is filled ONLY when currently NULL (a re-sent event
 * updates 0 rows), so a replayed bounce cannot inflate the auto-stop ratio and a late `delivered`
 * never overwrites a terminal bounced/complained status.
 *
 * WHEN THIS ROUTE MAY REPLACE MAILTRAP'S (do NOT delete Mailtrap's now): only once
 *   SELECT count(*) FROM crm_message_log WHERE status='sent' AND provider = 'mailtrap'  -- (or sent via Mailtrap)
 * reaches ZERO — i.e. no in-flight Mailtrap send can still deliver a delivered/bounced event. Until
 * then both routes must stay mounted or those transitions are lost and CRM shows `sent` forever.
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const svix = {
    id: req.headers.get(SVIX_ID_HEADER),
    timestamp: req.headers.get(SVIX_TIMESTAMP_HEADER),
    signature: req.headers.get(SVIX_SIGNATURE_HEADER),
  };
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? null;

  if (!verifyResendSignature(raw, svix, secret)) {
    logApiFailure("/api/resend/webhook", "signature_rejected", { status: 401 });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Signed-timestamp replay guard (the timestamp is part of the signed content, so this is trustworthy).
  if (isSvixTimestampTooOld(svix.timestamp, Date.now())) {
    return NextResponse.json({ ok: true, updated: 0, skippedStale: 1 });
  }

  const event = (() => {
    try {
      return parseResendEvent(JSON.parse(raw));
    } catch {
      return null;
    }
  })();
  if (!event) {
    logApiFailure("/api/resend/webhook", "bad_json", { status: 400 });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const effect = mapResendEvent(event.type, event.bounceType);
  if (!effect) return NextResponse.json({ ok: true, updated: 0 }); // transient/unknown — ignored, not guessed

  // Second replay guard, matching the Mailtrap route: also skip an old payload timestamp.
  if (isEventTooOld(event.timestampIso, Date.now())) {
    return NextResponse.json({ ok: true, updated: 0, skippedStale: 1 });
  }

  const admin = createAdminClient();
  const ts = event.timestampIso ?? new Date().toISOString();
  const patch: Record<string, unknown> = { [effect.column]: ts };
  if (effect.status) patch.status = effect.status;
  if (effect.failureCause) patch.failure_cause = effect.failureCause;

  // Correlation: try provider_message_id first; if 0 rows matched (Resend returns a UUID at
  // send time but delivers a msg_… id in the webhook — a format mismatch), fall back to
  // identity_hash + recipient email. Both passes carry the same idempotent-fill and
  // out-of-order guards. 200 on a DB blip: don't make Resend retry forever.
  try {
    let updated = 0;

    if (event.messageId) {
      let q = admin.from("crm_message_log").update(patch);
      q = q.is(effect.column, null);
      if (effect.status === "delivered") q = q.not("status", "in", '("bounced","complained")');
      q = q.eq("provider_message_id", event.messageId);
      const { data, error } = await q.select("id");
      if (error) {
        logApiFailure("/api/resend/webhook", "log_update_failed", { code: error.code });
        return NextResponse.json({ ok: false }, { status: 200 });
      }
      updated = data?.length ?? 0;
    }

    if (updated === 0 && event.email) {
      let hashSecret: string | null = null;
      try {
        hashSecret = identityHashSecret();
      } catch {
        hashSecret = null;
      }
      const norm = normalizeEmail(event.email);
      if (norm && hashSecret) {
        let q = admin.from("crm_message_log").update(patch);
        q = q.is(effect.column, null);
        if (effect.status === "delivered") q = q.not("status", "in", '("bounced","complained")');
        q = q.eq("identity_hash", hashIdentity("email", norm, hashSecret));
        const { data, error } = await q.select("id");
        if (error) {
          logApiFailure("/api/resend/webhook", "log_update_failed", { code: error.code });
          return NextResponse.json({ ok: false }, { status: 200 });
        }
        updated = data?.length ?? 0;
      }
    }

    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    logApiFailure("/api/resend/webhook", "update_threw", { code: (e as { code?: string })?.code });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
