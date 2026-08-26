"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface TestRecipient {
  id: string;
  email: string;
  label: string | null;
  addedBy: string | null;
  addedAt: string;
}

export async function listTestRecipientsAction(): Promise<{ ok: boolean; recipients: TestRecipient[] }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "send.at_or_below_threshold")) return { ok: false, recipients: [] };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_test_recipient")
      .select("id, email, label, added_by, added_at")
      .eq("is_active", true)
      .order("added_at", { ascending: false });
    if (error) return { ok: false, recipients: [] };
    return {
      ok: true,
      recipients: (data ?? []).map((r) => {
        const row = r as { id: string; email: string; label: string | null; added_by: string | null; added_at: string };
        return { id: row.id, email: row.email, label: row.label, addedBy: row.added_by, addedAt: row.added_at };
      }),
    };
  } catch {
    return { ok: false, recipients: [] };
  }
}

export async function addTestRecipientAction(
  email: string,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "send.at_or_below_threshold")) return { ok: false, error: "denied" };
  const clean = email.trim().toLowerCase();
  if (!clean.endsWith("@20fit.id")) return { ok: false, error: "not_internal" };
  let addedBy: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    addedBy = data.user?.email ?? null;
  } catch { /* fail-open on identity */ }
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("crm_test_recipient")
      .upsert({ email: clean, label: label.trim() || null, added_by: addedBy, is_active: true }, { onConflict: "email" });
    if (error) return { ok: false, error: error.code ?? "insert_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "threw" };
  }
}

export async function removeTestRecipientAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "send.at_or_below_threshold")) return { ok: false, error: "denied" };
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("crm_test_recipient")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.code ?? "update_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "threw" };
  }
}
