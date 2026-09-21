"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  saveDraft,
  listDrafts,
  loadDraft,
  deleteDraft,
  type SavedDraft,
} from "@/lib/crm/campaign-draft-store";

export type { SavedDraft };

export async function saveDraftAction(input: {
  id?: string;
  channel: string;
  segmentId: string | null;
  templateKey: string | null;
  label: string;
  whenMode: string;
  dateWib: string | null;
  timeWib: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, error: "denied" };

  let createdBy: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    createdBy = data.user?.email ?? null;
  } catch {
    createdBy = null;
  }

  return saveDraft({ ...input, createdBy });
}

export async function listDraftsAction(): Promise<{ ok: boolean; drafts: SavedDraft[] }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false, drafts: [] };
  return { ok: true, drafts: await listDrafts() };
}

export async function loadDraftAction(id: string): Promise<{ ok: boolean; draft?: SavedDraft }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  const draft = await loadDraft(id);
  if (!draft) return { ok: false };
  return { ok: true, draft };
}

export async function deleteDraftAction(id: string): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "send.at_or_below_threshold") === "deny") return { ok: false };
  return deleteDraft(id);
}
