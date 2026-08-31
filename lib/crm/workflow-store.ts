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

export interface WorkflowWithCounts extends Workflow {
  enrolledCount: number;
  sentCount: number;
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

  // Per-workflow enrollment + sent counts (head:true, no rows pulled).
  const withCounts = await Promise.all(
    workflows.map(async (w) => {
      const [enr, sent] = await Promise.all([
        admin.from("crm_workflow_enrollment").select("id", { count: "exact", head: true }).eq("workflow_id", w.id),
        admin.from("crm_workflow_enrollment").select("id", { count: "exact", head: true }).eq("workflow_id", w.id).eq("status", "sent"),
      ]);
      return { ...w, enrolledCount: enr.count ?? 0, sentCount: sent.count ?? 0 };
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
        is_active: false, // dibuat non-aktif; operator mengaktifkan setelah uji
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

export async function setWorkflowActive(id: string, active: boolean): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("crm_workflow").update({ is_active: active }).eq("id", id);
    return { ok: !error };
  } catch {
    return { ok: false };
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
