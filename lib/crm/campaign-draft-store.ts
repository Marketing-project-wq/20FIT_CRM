import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SavedDraft {
  id: string;
  channel: "email";
  segmentId: string | null;
  segmentName: string | null;
  templateKey: string | null;
  label: string;
  whenMode: "now" | "schedule";
  dateWib: string | null;
  timeWib: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DraftRow {
  id: string;
  channel: string;
  segment_id: string | null;
  template_key: string | null;
  label: string;
  when_mode: string;
  date_wib: string | null;
  time_wib: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const DRAFT_COLS = "id, channel, segment_id, template_key, label, when_mode, date_wib, time_wib, created_by, created_at, updated_at";

function toDraft(r: DraftRow, segmentName: string | null): SavedDraft {
  return {
    id: r.id,
    channel: r.channel === "email" ? "email" : "email",
    segmentId: r.segment_id,
    segmentName,
    templateKey: r.template_key,
    label: r.label,
    whenMode: r.when_mode === "schedule" ? "schedule" : "now",
    dateWib: r.date_wib,
    timeWib: r.time_wib,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function saveDraft(input: {
  id?: string;
  channel: string;
  segmentId: string | null;
  templateKey: string | null;
  label: string;
  whenMode: string;
  dateWib: string | null;
  timeWib: string | null;
  createdBy: string | null;
}): Promise<{ ok: boolean; id?: string }> {
  try {
    const admin = createAdminClient();
    const row = {
      channel: input.channel || "email",
      segment_id: input.segmentId || null,
      template_key: input.templateKey || null,
      label: input.label || "",
      when_mode: input.whenMode === "schedule" ? "schedule" : "now",
      date_wib: input.dateWib || null,
      time_wib: input.timeWib || null,
      created_by: input.createdBy,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await admin
        .from("crm_campaign_draft")
        .update(row)
        .eq("id", input.id);
      if (error) return { ok: false };
      return { ok: true, id: input.id };
    }

    const { data, error } = await admin
      .from("crm_campaign_draft")
      .insert({ ...row, created_by: input.createdBy })
      .select("id")
      .single();
    if (error || !data) return { ok: false };
    return { ok: true, id: (data as { id: string }).id };
  } catch {
    return { ok: false };
  }
}

export async function listDrafts(): Promise<SavedDraft[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_campaign_draft")
      .select(DRAFT_COLS)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    const rows = data as DraftRow[];
    const segIds = Array.from(new Set(rows.map((r) => r.segment_id).filter(Boolean))) as string[];
    const segMap: Record<string, string> = {};
    if (segIds.length > 0) {
      const { data: segs, error: segErr } = await admin
        .from("crm_segment")
        .select("id, name")
        .in("id", segIds);
      if (!segErr && segs) {
        for (const s of segs as { id: string; name: string }[]) {
          segMap[s.id] = s.name;
        }
      }
    }
    return rows.map((r) => toDraft(r, r.segment_id ? segMap[r.segment_id] ?? null : null));
  } catch {
    return [];
  }
}

export async function loadDraft(id: string): Promise<SavedDraft | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_campaign_draft")
      .select(DRAFT_COLS)
      .eq("id", id)
      .single();
    if (error || !data) return null;
    const r = data as DraftRow;
    let segName: string | null = null;
    if (r.segment_id) {
      const { data: seg, error: segErr } = await admin.from("crm_segment").select("name").eq("id", r.segment_id).single();
      segName = !segErr && seg ? (seg as { name: string }).name : null;
    }
    return toDraft(r, segName);
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("crm_campaign_draft").delete().eq("id", id);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
