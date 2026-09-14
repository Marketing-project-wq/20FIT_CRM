/**
 * One-off script: send doorprize PLN Mobile Electric 5K emails with unique codes.
 * Logs each send to crm_campaign_run + crm_message_log.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx RESEND_FROM=info@20fit.id npx tsx scripts/send-doorprize.ts
 *
 * Or load from .env.local:
 *   npx tsx -r dotenv/config scripts/send-doorprize.ts dotenv_config_path=.env.local
 *
 * Required env vars:
 *   RESEND_API_KEY, RESEND_FROM,
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   UNSUBSCRIBE_TOKEN_SECRET (>=16 chars, for identity hash)
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";
import { createClient } from "@supabase/supabase-js";
import { correctEmailDomain } from "../lib/crm/email-domain-correct";
import { normalizeEmail } from "../lib/crm/normalize";
import { hashIdentity, identityHashSecret } from "../lib/crm/identity-hash";

const SUBJECT = "Free Ticket PLN Mobile Electric 5K Jakarta Menantimu — Klaim Sekarang";
const FROM_NAME = "PLN Mobile Electric 5K Jakarta";
const SEND_ENDPOINT = "https://api.resend.com/emails";
const RATE_LIMIT_MS = 1000;
const TEMPLATE_KEY = "email_doorprize_pln_5k";
const CAMPAIGN_LABEL = "Doorprize PLN Mobile Electric 5K Jakarta";

interface Recipient {
  nama: string;
  email: string;
  kodeUnik: string;
  emailOriginal: string;
  emailCorrected: boolean;
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function loadTemplate(): string {
  const path = resolve(__dirname, "email-doorprize-pln-5k.html");
  return readFileSync(path, "utf-8");
}

function loadRecipients(): Recipient[] {
  const path = resolve(__dirname, "doorprize-recipients.csv");
  const raw = readFileSync(path, "utf-8").trim();
  const lines = raw.split("\n").slice(1);

  return lines.map((line) => {
    const parts = line.split(",");
    const nama = parts[0].trim();
    const emailRaw = parts[1].trim();
    const kodeUnik = parts[2].trim();

    const emailFixed = correctEmailDomain(emailRaw);
    return {
      nama,
      email: emailFixed,
      kodeUnik,
      emailOriginal: emailRaw,
      emailCorrected: emailFixed !== emailRaw.trim().toLowerCase(),
    };
  });
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        tags: [{ name: "category", value: "doorprize-pln-5k" }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? undefined };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function lookupCustomerId(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await admin
    .from("master_customer")
    .select("customer_id")
    .eq("email_normalized", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`   ⚠ Customer lookup error for ${email}: ${error.message}`);
    return null;
  }
  return data?.customer_id ?? null;
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM;

  if (!apiKey) {
    console.error("❌ RESEND_API_KEY not set. Set it in environment or .env.local");
    process.exit(1);
  }
  if (!fromEmail) {
    console.error("❌ RESEND_FROM not set. Set it in environment or .env.local");
    process.exit(1);
  }

  const from = `${FROM_NAME} <${fromEmail}>`;

  // Validate Supabase env vars early
  const admin = createAdminClient();
  console.log("✓ Supabase admin client created");

  // Validate identity hash secret early
  let identitySecret: string;
  try {
    identitySecret = identityHashSecret();
    console.log("✓ Identity hash secret available");
  } catch (e) {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(1);
  }

  console.log("\n📧 PLN Mobile Electric 5K Doorprize Emailer (with CRM logging)");
  console.log("─".repeat(50));

  const template = loadTemplate();
  console.log(`✓ Template loaded`);

  const recipients = loadRecipients();
  console.log(`✓ ${recipients.length} recipients loaded`);

  const corrected = recipients.filter((r) => r.emailCorrected);
  if (corrected.length > 0) {
    console.log(`\n⚠️  Email domain corrections applied:`);
    for (const r of corrected) {
      console.log(`   ${r.emailOriginal} → ${r.email}`);
    }
  }

  // Pre-lookup customer IDs
  console.log(`\nLooking up customer IDs...`);
  const customerIdMap = new Map<string, string | null>();
  for (const r of recipients) {
    const normalized = normalizeEmail(r.email);
    if (normalized && !customerIdMap.has(normalized)) {
      const customerId = await lookupCustomerId(admin, r.email);
      customerIdMap.set(normalized, customerId);
    }
  }
  const foundCount = [...customerIdMap.values()].filter(Boolean).length;
  const missingCount = [...customerIdMap.values()].filter((v) => !v).length;
  console.log(`✓ ${foundCount} customers found, ${missingCount} not in master_customer`);

  if (missingCount > 0) {
    console.log(`\n⚠️  Recipients NOT in master_customer (will still send, but no CRM log):`);
    for (const [email, id] of customerIdMap) {
      if (!id) console.log(`   ${email}`);
    }
  }

  console.log(`\nFrom: ${from}`);
  console.log(`Subject: ${SUBJECT}`);

  // === PREVIEW ===
  const PREVIEW_COUNT = 5;
  const previewSlice = recipients.slice(0, PREVIEW_COUNT);
  const remaining = recipients.length - PREVIEW_COUNT;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`=== PREVIEW (${previewSlice.length} dari ${recipients.length} email) ===`);
  console.log(`${"=".repeat(50)}\n`);

  for (let i = 0; i < previewSlice.length; i++) {
    const r = previewSlice[i];
    console.log(`${i + 1}. ${r.email}`);
    console.log(`   Nama: ${r.nama}`);
    console.log(`   Kode: ${r.kodeUnik}`);
    console.log("");
  }

  if (remaining > 0) {
    console.log(`... dan ${remaining} lainnya\n`);
  }

  // === DUPLICATE ANALYSIS ===
  const emailCount = new Map<string, number>();
  for (const r of recipients) {
    emailCount.set(r.email, (emailCount.get(r.email) ?? 0) + 1);
  }
  const uniqueRecipients = emailCount.size;
  const duplicates = [...emailCount.entries()].filter(([, count]) => count > 1);

  console.log(`${"─".repeat(50)}`);
  console.log(`📊 Total emails: ${recipients.length}`);
  console.log(`   Unique recipients: ${uniqueRecipients}`);
  if (duplicates.length > 0) {
    const dupStr = duplicates.map(([email, count]) => `${email} (${count})`).join(", ");
    console.log(`   Duplikat (multiple kode): ${dupStr}`);
  }
  console.log(`${"─".repeat(50)}`);

  console.log("");
  const proceed = await confirm(`Preview looks correct? Send all ${recipients.length} emails? (y/n) `);
  if (!proceed) {
    console.log("Aborted.");
    process.exit(0);
  }

  // Create campaign run record
  const nowIso = new Date().toISOString();
  const { data: runData, error: runError } = await admin
    .from("crm_campaign_run")
    .insert({
      template_key: TEMPLATE_KEY,
      label: CAMPAIGN_LABEL,
      status: "sending",
      created_by: "script:send-doorprize",
      segment_id: null,
      workflow_id: null,
    })
    .select("id")
    .single();

  if (runError) {
    console.error(`❌ Failed to create campaign run: ${runError.message}`);
    console.error("   Hint: crm_campaign_run has a XOR constraint — exactly one of segment_id or workflow_id must be non-null.");
    console.error("   This script sets both to null, which violates the constraint.");
    console.error("   You may need to create a dummy segment or temporarily drop the constraint.");
    process.exit(1);
  }

  const campaignRunId = runData.id as string;
  console.log(`\n✓ Campaign run created: ${campaignRunId}`);
  console.log(`${"─".repeat(50)}`);
  console.log("Sending...\n");

  let sent = 0;
  let failed = 0;
  const failures: { email: string; kode: string; error: string }[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const html = template
      .replace(/\{\{NAMA\}\}/g, r.nama)
      .replace(/\{\{KODE_UNIK\}\}/g, r.kodeUnik);

    const normalized = normalizeEmail(r.email);
    const customerId = normalized ? customerIdMap.get(normalized) : null;
    const identityHash = normalized
      ? hashIdentity("email", normalized, identitySecret)
      : null;

    const result = await sendEmail(apiKey, from, r.email, SUBJECT, html);

    if (result.ok) {
      sent++;
      console.log(`✅ [${i + 1}/${recipients.length}] Sent to ${r.email} (KODE: ${r.kodeUnik})`);

      // Log to crm_message_log if we have a customer_id
      if (customerId) {
        const idempotencyKey = `doorprize-pln5k-${r.kodeUnik}`;
        const { error: logError } = await admin.from("crm_message_log").insert({
          customer_id: customerId,
          channel: "email",
          campaign_id: campaignRunId,
          template_key: TEMPLATE_KEY,
          template_version: 1,
          identity_hash: identityHash,
          subject: SUBJECT,
          language: "id",
          idempotency_key: idempotencyKey,
          provider_message_id: result.id ?? null,
          status: "sent",
          sent_at: new Date().toISOString(),
        });

        if (logError) {
          if (logError.code === "23505") {
            console.log(`   ⚠ Message log already exists (idempotency: ${idempotencyKey})`);
          } else {
            console.error(`   ⚠ Message log insert failed: ${logError.message}`);
          }
        } else {
          console.log(`   📝 CRM log recorded`);
        }
      } else {
        console.log(`   ⚠ No customer_id — CRM log skipped`);
      }
    } else {
      failed++;
      console.log(`❌ [${i + 1}/${recipients.length}] Failed: ${r.email} - ${result.error}`);
      failures.push({ email: r.email, kode: r.kodeUnik, error: result.error ?? "unknown" });

      // Log failure to crm_message_log if we have a customer_id
      if (customerId) {
        const idempotencyKey = `doorprize-pln5k-${r.kodeUnik}`;
        const { error: logError } = await admin.from("crm_message_log").insert({
          customer_id: customerId,
          channel: "email",
          campaign_id: campaignRunId,
          template_key: TEMPLATE_KEY,
          template_version: 1,
          identity_hash: identityHash,
          subject: SUBJECT,
          language: "id",
          idempotency_key: idempotencyKey,
          status: "failed",
          failure_cause: "provider_rejected",
          error_message: (result.error ?? "unknown").slice(0, 200),
        });

        if (logError && logError.code !== "23505") {
          console.error(`   ⚠ Failed message log insert: ${logError.message}`);
        }
      }
    }

    if (i < recipients.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Update campaign run status
  const finalStatus = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  const { error: updateError } = await admin
    .from("crm_campaign_run")
    .update({
      status: finalStatus,
      last_error: failures.length > 0 ? `${failures.length} failed: ${failures.map((f) => f.email).join(", ")}` : null,
    })
    .eq("id", campaignRunId);

  if (updateError) {
    console.error(`\n⚠ Failed to update campaign run status: ${updateError.message}`);
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`📊 Summary:`);
  console.log(`   Campaign Run: ${campaignRunId}`);
  console.log(`   Status: ${finalStatus}`);
  console.log(`   Total: ${recipients.length}`);
  console.log(`   ✅ Sent: ${sent}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failures.length > 0) {
    console.log(`\n   Failed emails:`);
    for (const f of failures) {
      console.log(`   - ${f.email} (${f.kode}): ${f.error}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
