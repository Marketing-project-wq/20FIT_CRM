"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listWorkflows,
  createWorkflow,
  setWorkflowActive,
  getWorkflowById,
  type WorkflowWithCounts,
  type WorkflowType,
  type WorkflowTriggerSource,
} from "@/lib/crm/workflow-store";
import { resolveActivityTimeIds, resolvePoolNewIds } from "@/lib/crm/activity";
import { sendCampaign } from "@/lib/crm/send-campaign";
import { getSendConfig } from "@/lib/crm/send-config";
import { DEFAULT_SEND_CONFIG } from "@/lib/crm/send-run";
import { createRun } from "@/lib/crm/campaign-run";

/**
 * Workflow server actions (Fase 3). Definisi + run engine. Engine meng-enroll profil yang match
 * trigger waktu (dari lapisan aktivitas) DAN belum enrolled, lalu kirim lewat sendCampaign yang
 * ADA (override recipients dari daftar customer_id yang di-enroll). Idempoten: unique
 * (workflow, customer) mencegah kirim ganda; hanya enrollment 'queued' yang dikirim.
 *
 * Gate: send.at_or_below_threshold (sama seperti campaign). Pre-launch withhold tetap berlaku
 * di sendCampaign (maySendTo) — jadi menjalankan workflow saat kirim nyata off hanya mengirim
 * ke alamat internal, sisanya withheld.
 */

async function actorEmail(): Promise<string | null> {
  try {
    return (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function listWorkflowsAction(): Promise<{ ok: boolean; workflows: WorkflowWithCounts[] }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, workflows: [] };
  return { ok: true, workflows: await listWorkflows() };
}

export async function createWorkflowAction(input: {
  name: string;
  type: WorkflowType;
  triggerDays: number;
  triggerSource: WorkflowTriggerSource;
  templateKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };
  const res = await createWorkflow({ ...input, createdBy: await actorEmail() });
  return { ok: res.ok, error: res.error };
}

export async function setWorkflowActiveAction(id: string, active: boolean): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  return setWorkflowActive(id, active);
}

export interface WorkflowRunResult {
  ok: boolean;
  error?: string;
  newlyEnrolled?: number;
  sent?: number;
  withheld?: number;
  failed?: number;
}

/**
 * Jalankan satu workflow SEKARANG (manual trigger dari UI, atau nanti dari pg_cron). Resolusi
 * kandidat dari lapisan aktivitas → enroll yang baru → kirim ke yang 'queued' lewat sendCampaign.
 */
export async function runWorkflowAction(workflowId: string): Promise<WorkflowRunResult> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  const admin = createAdminClient();
  const wf = await getWorkflowById(admin, workflowId);
  if (!wf) return { ok: false, error: "not_found" };

  // Refuse to run a PAUSED workflow — the engine, not just the UI, honours is_active. A run on an
  // inactive workflow returns a NAMED reason (not a coarse failure), so the badge and behaviour agree.
  if (!wf.isActive) return { ok: false, error: "workflow_inactive" };

  // 1. Resolusi kandidat dari sumber pemicu.
  //    welcome + pool     → master_customer.created_at ≤ triggerDays (profil BARU di pool, cakupan penuh)
  //    welcome + activity → crm_customer_activity.joined_at ≤ triggerDays (aktivitas-pertama, 0,88%)
  //    reengagement       → crm_customer_activity.last_active_at ≥ triggerDays (sudah lama diam)
  let candidateIds: Set<string> | null;
  try {
    if (wf.type === "welcome") {
      candidateIds =
        wf.triggerSource === "pool"
          ? await resolvePoolNewIds(admin, wf.triggerDays)
          : await resolveActivityTimeIds(admin, wf.triggerDays, null);
    } else {
      candidateIds = await resolveActivityTimeIds(admin, null, wf.triggerDays);
    }
  } catch {
    return { ok: false, error: "resolve_failed" };
  }
  const candidates = candidateIds ? Array.from(candidateIds) : [];
  if (candidates.length === 0) return { ok: true, newlyEnrolled: 0, sent: 0, withheld: 0, failed: 0 };

  // 2. Enroll yang BELUM enrolled (idempoten via unique constraint — konflik diabaikan).
  const { data: existing } = await admin
    .from("crm_workflow_enrollment")
    .select("customer_id")
    .eq("workflow_id", workflowId);
  const already = new Set((existing ?? []).map((r) => (r as { customer_id: string }).customer_id));
  const toEnroll = candidates.filter((id) => !already.has(id));

  if (toEnroll.length > 0) {
    await admin.from("crm_workflow_enrollment").insert(
      toEnroll.map((customer_id) => ({ workflow_id: workflowId, customer_id, status: "queued" as const })),
    );
  }

  // 3. Ambil yang masih 'queued' → kirim lewat sendCampaign (override recipients dari master).
  const { data: queued } = await admin
    .from("crm_workflow_enrollment")
    .select("id, customer_id")
    .eq("workflow_id", workflowId)
    .eq("status", "queued");
  const queuedRows = (queued ?? []) as { id: string; customer_id: string }[];
  if (queuedRows.length === 0) return { ok: true, newlyEnrolled: toEnroll.length, sent: 0, withheld: 0, failed: 0 };

  // Resolve email untuk penerima (customer_id → email_normalized). Chunk .in().
  const idList = queuedRows.map((r) => r.customer_id);
  const recipients: { customerId: string; email: string; language: "id" }[] = [];
  for (let i = 0; i < idList.length; i += 500) {
    const chunk = idList.slice(i, i + 500);
    const { data: profs } = await admin
      .from("master_customer")
      .select("customer_id, email_normalized")
      .in("customer_id", chunk)
      .not("email_normalized", "is", null);
    for (const p of (profs ?? []) as { customer_id: string; email_normalized: string }[]) {
      recipients.push({ customerId: p.customer_id, email: p.email_normalized, language: "id" });
    }
  }
  if (recipients.length === 0) return { ok: true, newlyEnrolled: toEnroll.length, sent: 0, withheld: 0, failed: 0 };

  // Satu run per eksekusi workflow — pakai template & jalur kirim yang sama seperti campaign.
  const email = await actorEmail();
  const run = await createRun({
    workflowId, // run ini milik workflow (bukan segment) — XOR di crm_campaign_run menegakkannya (T-38)
    templateKey: wf.templateKey,
    label: `Workflow: ${wf.name}`,
    createdBy: email,
  });
  if (!run) return { ok: false, error: "run_create_failed" };

  // Workflow sends are capped SEPARATELY (workflow_daily_cap, default 300) so automated volume can't
  // consume the whole daily ceiling and starve manual campaigns. Over the cap → recipients defer to a
  // later run, same "defer, don't fail" posture as the daily limit. The bounce auto-stop config is
  // untouched (stays active regardless of the cap — owner rule e).
  const { workflowDailyCap } = await getSendConfig(admin);
  let result;
  try {
    result = await sendCampaign(
      {
        campaignId: run.id,
        criteria: { ...EMPTY_WORKFLOW_CRITERIA },
        masterFilterExpr: null,
        templateKey: wf.templateKey,
        actorId: email ?? "system:workflow",
        actorEmail: email,
        confirmedLargeSend: true, // workflow menyasar kelompok kecil beraktivitas; ambang besar tak relevan
        config: { ...DEFAULT_SEND_CONFIG, dailyLimit: workflowDailyCap },
        overrideRecipients: recipients,
      },
      new Date().toISOString(),
    );
  } catch {
    return { ok: false, error: "send_threw", newlyEnrolled: toEnroll.length };
  }

  // 4. Tandai enrollment yang terkirim.
  const sentIds = new Set(recipients.map((r) => r.customerId));
  const sentEnrollmentIds = queuedRows.filter((r) => sentIds.has(r.customer_id)).map((r) => r.id);
  for (let i = 0; i < sentEnrollmentIds.length; i += 500) {
    const chunk = sentEnrollmentIds.slice(i, i + 500);
    await admin
      .from("crm_workflow_enrollment")
      .update({ status: "sent", sent_at: new Date().toISOString(), campaign_run_id: run.id })
      .in("id", chunk);
  }

  const failedTotal =
    result.summary.failed.invalid_address + result.summary.failed.hard_bounce +
    result.summary.failed.provider_rejected + result.summary.failed.unknown;

  return {
    ok: true,
    newlyEnrolled: toEnroll.length,
    sent: result.summary.sent,
    withheld: result.withheldPrelaunch,
    failed: failedTotal,
  };
}

// EMPTY criteria — workflow pakai overrideRecipients, jadi criteria tak dipakai untuk resolusi;
// tetap harus valid untuk sendCampaign. Impor EMPTY_CRITERIA dari segment agar tetap sinkron.
import { EMPTY_CRITERIA } from "@/lib/crm/segment";
const EMPTY_WORKFLOW_CRITERIA = EMPTY_CRITERIA;
