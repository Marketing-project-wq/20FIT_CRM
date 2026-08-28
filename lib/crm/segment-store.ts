import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasClinicalCriteria, EMPTY_CRITERIA, type SegmentCriteria } from "./segment";

/**
 * Saved-segment store (K-40). Persists the DEFINITION (criteria + the validated AND/OR expression),
 * never a member list — members are recomputed on use so a segment saved last month, sent today,
 * targets who matches TODAY and respects suppression as of the send. requires_clinical is computed
 * at save; the view_health gate is re-checked against the USING role at use time (send-campaign),
 * not the creator's, so a saved clinical segment can't be a way around the gate.
 */

/** The full definition we persist in crm_segment.criteria (jsonb): flat criteria + the validated
 *  master AND/OR expression (produced by the tree validator; null when the builder used no tree).
 *  A STATIC email-list segment carries `emailList` instead — a fixed set of normalised emails
 *  (e.g. admin addresses for testing). When emailList is present it takes precedence: the segment
 *  targets exactly those addresses via overrideRecipients, never touching master_customer. It still
 *  passes through suppression + pre-launch withhold at send time. */
export interface StoredSegment {
  criteria: SegmentCriteria;
  masterFilterExpr: string | null;
  /** Static email list (manual segment). When set + non-empty, this is an email_list segment. */
  emailList?: string[];
}

export interface SavedSegmentMeta {
  id: string;
  name: string;
  requiresClinical: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface SaveResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function saveSegment(input: {
  name: string;
  stored: StoredSegment;
  createdBy: string | null;
}): Promise<SaveResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "empty_name" };
  const requiresClinical = hasClinicalCriteria(input.stored.criteria);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_segment")
      .insert({
        name,
        criteria: input.stored,
        requires_clinical: requiresClinical,
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

export async function listSegments(): Promise<SavedSegmentMeta[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_segment")
      .select("id, name, requires_clinical, created_by, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map((r) => {
      const row = r as { id: string; name: string; requires_clinical: boolean; created_by: string | null; created_at: string };
      return {
        id: row.id,
        name: row.name,
        requiresClinical: row.requires_clinical,
        createdBy: row.created_by,
        createdAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
}

export interface LoadedSegment {
  id: string;
  name: string;
  requiresClinical: boolean;
  stored: StoredSegment;
}

/** Load one segment's definition for USE (count/send). Coerces the stored jsonb back to a full
 *  SegmentCriteria (defaulting any missing key from EMPTY_CRITERIA, so an older saved shape can't
 *  crash the reader). Returns null if not found. */
export async function getSegmentById(id: string): Promise<LoadedSegment | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_segment")
      .select("id, name, requires_clinical, criteria")
      .eq("id", id)
      .eq("is_active", true)
      .single();
    if (error || !data) return null;
    const row = data as { id: string; name: string; requires_clinical: boolean; criteria: unknown };
    const raw = (row.criteria ?? {}) as Partial<StoredSegment>;
    const emailList = Array.isArray(raw.emailList)
      ? raw.emailList.filter((e): e is string => typeof e === "string" && e.length > 0)
      : undefined;
    const stored: StoredSegment = {
      criteria: { ...EMPTY_CRITERIA, ...(raw.criteria ?? {}) },
      masterFilterExpr: typeof raw.masterFilterExpr === "string" ? raw.masterFilterExpr : null,
      ...(emailList && emailList.length > 0 ? { emailList } : {}),
    };
    return { id: row.id, name: row.name, requiresClinical: row.requires_clinical, stored };
  } catch {
    return null;
  }
}
