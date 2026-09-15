import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Workflow store (Fase 3). A workflow is a scheduled, trigger-based send built on the activity
 * layer: a "welcome" fires for profiles that joined ≤ trigger_days ago; a "reengagement" fires
 * for profiles inactive ≥ trigger_days. Enrollment is idempotent (unique workflow+customer), so
 * a person is welcomed once. The actual send goes through the SAME sendCampaign path as a manual
 * campaign — this module never sends; it records definitions and enrollments.
 */

export type WorkflowType = "welcome" | "reengagement";
export type WorkflowTriggerSource = "activity" | "pool";
export type EnrollmentStatus = "queued" | "sent" | "failed" | "skipped";

export interface Workflow {
  id: string;
  name: string;
  type: WorkflowType;
  triggerDays: number;
  triggerSource: WorkflowTriggerSource;
  templateKey: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface StatusCounts {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface WorkflowWithCounts extends Workflow {
  enrolledCount: number;
  sentCount: number;
  statusCounts: StatusCounts;
  lastEnrolledAt: string | null;
}

interface WorkflowRow {
  id: string;
  name: string;
  type: WorkflowType;
  trigger_days: number;
  trigger_source: WorkflowTriggerSource;
  template_key: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

function toWorkflow(r: WorkflowRow): Workflow {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    triggerDays: r.trigger_days,
    triggerSource: r.trigger_source ?? "activity",
    templateKey: r.template_key,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export async function listWorkflows(): Promise<WorkflowWithCounts[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_workflow")
    .select("id, name, type, trigger_days, trigger_source, template_key, is_active, created_by, created_at")
    .order("created_at", { ascending: false });
  if (error) return [];
  const workflows = (data ?? []).map((r) => toWorkflow(r as WorkflowRow));

  const withCounts = await Promise.all(
    workflows.map(async (w) => {
      const { data: enrollments } = await admin
        .from("crm_workflow_enrollment")
        .select("status, enrolled_at")
        .eq("workflow_id", w.id);

      const sc: StatusCounts = { queued: 0, sent: 0, failed: 0, skipped: 0 };
      let lastEnrolledAt: string | null = null;
      for (const e of (enrollments ?? []) as { status: EnrollmentStatus; enrolled_at: string }[]) {
        sc[e.status] = (sc[e.status] || 0) + 1;
        if (!lastEnrolledAt || e.enrolled_at > lastEnrolledAt) lastEnrolledAt = e.enrolled_at;
      }

      return {
        ...w,
        enrolledCount: sc.queued + sc.sent + sc.failed + sc.skipped,
        sentCount: sc.sent,
        statusCounts: sc,
        lastEnrolledAt,
      };
    }),
  );
  return withCounts;
}

export async function createWorkflow(input: {
  name: string;
  type: WorkflowType;
  triggerDays: number;
  triggerSource: WorkflowTriggerSource;
  templateKey: string;
  createdBy: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "empty_name" };
  if (input.triggerDays < 1 || input.triggerDays > 3650) return { ok: false, error: "bad_days" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_workflow")
      .insert({
        name,
        type: input.type,
        trigger_days: input.triggerDays,
        trigger_source: input.triggerSource,
        template_key: input.templateKey,
        is_active: false,
        created_by: input.createdBy,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.code ?? "insert_failed" };
    return { ok: true, id: (data as { id: string }).id };
  } catch {
    return { ok: false, error: "threw" };
  }
}

export async function updateWorkflow(id: string, input: {
  name?: string;
  templateKey?: string;
  triggerDays?: number;
  triggerSource?: WorkflowTriggerSource;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.templateKey !== undefined) update.template_key = input.templateKey;
    if (input.triggerDays !== undefined) update.trigger_days = input.triggerDays;
    if (input.triggerSource !== undefined) update.trigger_source = input.triggerSource;
    if (Object.keys(update).length === 0) return { ok: true };
    const { error } = await admin.from("crm_workflow").update(update).eq("id", id);
    return { ok: !error, error: error?.code };
  } catch {
    return { ok: false, error: "threw" };
  }
}

export async function setWorkflowActive(id: string, active: boolean): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("crm_workflow").update({ is_active: active }).eq("id", id);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function deleteWorkflow(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("crm_campaign_run")
      .select("id", { count: "exact", head: true })
      .eq("workflow_id", id);
    if ((count ?? 0) > 0) return { ok: false, error: "has_runs" };
    const { error } = await admin.from("crm_workflow").delete().eq("id", id);
    return { ok: !error, error: error?.code };
  } catch {
    return { ok: false, error: "threw" };
  }
}

export async function getWorkflowById(admin: SupabaseClient, id: string): Promise<Workflow | null> {
  const { data, error } = await admin
    .from("crm_workflow")
    .select("id, name, type, trigger_days, trigger_source, template_key, is_active, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return toWorkflow(data as WorkflowRow);
}

export interface EnrollmentRow {
  id: string;
  customerId: string;
  email: string | null;
  status: EnrollmentStatus;
  enrolledAt: string;
  sentAt: string | null;
}

export async function listEnrollments(workflowId: string, limit = 200): Promise<EnrollmentRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_workflow_enrollment")
    .select("id, customer_id, status, enrolled_at, sent_at")
    .eq("workflow_id", workflowId)
    .order("enrolled_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const rows = data as { id: string; customer_id: string; status: EnrollmentStatus; enrolled_at: string; sent_at: string | null }[];

  const customerIds = rows.map((r) => r.customer_id);
  const emailMap = new Map<string, string>();
  for (let i = 0; i < customerIds.length; i += 500) {
    const chunk = customerIds.slice(i, i + 500);
    const { data: profs } = await admin
      .from("master_customer")
      .select("customer_id, email_normalized")
      .in("customer_id", chunk);
    for (const p of (profs ?? []) as { customer_id: string; email_normalized: string | null }[]) {
      if (p.email_normalized) emailMap.set(p.customer_id, p.email_normalized);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    email: emailMap.get(r.customer_id) ?? null,
    status: r.status,
    enrolledAt: r.enrolled_at,
    sentAt: r.sent_at,
  }));
}
