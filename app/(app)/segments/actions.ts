"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n/server";
import { isPermitted } from "@/lib/auth/roles";
import { saveSegment } from "@/lib/crm/segment-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFilterTree, filterTreeToExpr, type FilterNode } from "@/lib/crm/filter-tree";
import type { SegmentCriteria } from "@/lib/crm/segment";

/**
 * Save a segment DEFINITION (K-40). Gate: segment.build (same as the builder). The AND/OR tree is
 * validated + converted to the master expression server-side with the SAME functions the count path
 * uses, so a saved segment can never mean something the count didn't — and an invalid tree is
 * refused rather than silently saved as the broader flat criteria (which would target more people
 * than the operator built).
 */
export async function saveSegmentAction(input: {
  name: string;
  criteria: SegmentCriteria;
  tree: FilterNode | null;
}): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  if (!input.name.trim()) return { ok: false, error: "empty_name" };

  let masterFilterExpr: string | null = null;
  if (input.tree) {
    const valid = validateFilterTree(input.tree, 1, getLang());
    if (!valid.ok) return { ok: false, error: "invalid_tree" };
    masterFilterExpr = filterTreeToExpr(input.tree);
  }

  let email: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    // fail-open on identity only (createdBy null); the row still saves.
  }

  const res = await saveSegment({
    name: input.name,
    stored: { criteria: input.criteria, masterFilterExpr },
    createdBy: email,
  });
  return { ok: res.ok, error: res.error };
}

/** Soft-delete a saved segment (sets is_active = false). Gate: segment.build. */
export async function deleteSegmentAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) return { ok: false, error: "denied" };
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("crm_segment")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.code ?? "update_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "threw" };
  }
}
