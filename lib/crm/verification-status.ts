import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * VERIFICATION STATUS, COMPUTED FROM crm_audit_log — never typed into a document.
 *
 * Twice now, evidence that a screen worked in production was MISSED because the status
 * lived in a markdown file a human had to update, while the proof lived in a table that
 * moves on its own: `/consent` was proven at id=32 but read "unproven" for a whole sprint;
 * `/settings` was proven at id 44–47 and only noticed when someone re-checked. This module
 * derives the status from the data so it can never go stale (docs/riwayat/TEMUAN.md S-07,
 * KEPUTUSAN K-22).
 *
 * THREE categories, and the third MUST NOT be collapsed into the second:
 *   - proven          — a row exists that ONLY this route can produce.
 *   - unproven        — this route writes audit, but no such row exists yet.
 *   - not_auditable   — this route DELIBERATELY writes no audit (K-07: parameter-free
 *                       aggregates). Zero rows is the CORRECT behavior, not missing proof.
 *                       Merging this into "unproven" inverts the Sprint 3E rule. For these,
 *                       name the only possible evidence: Railway logs or a human's eyes.
 */

export type VStatus = "proven" | "unproven" | "not_auditable";

export interface ScreenDef {
  key: string;
  label: string;
  route: string;
  kind: "auditable" | "not_auditable";
  /** For auditable screens: the (action, target_table) that ONLY this route emits. */
  signal?: { action: string; targetTable: string };
  /** For not_auditable screens: the only evidence that can exist. */
  onlyEvidence?: string;
}

/** The screens whose live status we can (or explicitly cannot) derive from audit. */
export const SCREENS: readonly ScreenDef[] = [
  {
    key: "audience_list",
    label: "Audience — daftar",
    route: "/audience",
    kind: "auditable",
    signal: { action: "list.viewed", targetTable: "master_customer" },
  },
  {
    key: "profile_detail",
    label: "Detail profil (V-6)",
    route: "/audience/[id]",
    kind: "auditable",
    signal: { action: "profile.viewed", targetTable: "master_customer" },
  },
  {
    key: "search",
    label: "Pencarian profil",
    route: "/api/search",
    kind: "auditable",
    signal: { action: "search.performed", targetTable: "master_customer" },
  },
  {
    key: "consent",
    label: "Consent register",
    route: "/consent",
    kind: "auditable",
    signal: { action: "list.viewed", targetTable: "crm_consent" },
  },
  {
    key: "audit_screen",
    label: "Audit log — settings",
    route: "/settings",
    kind: "auditable",
    signal: { action: "list.viewed", targetTable: "crm_audit_log" },
  },
  {
    key: "dashboard",
    label: "Dashboard",
    route: "/",
    kind: "not_auditable",
    onlyEvidence: "Sengaja tak menulis audit (K-07). Bukti hanya: log Railway (200 /api/dashboard) atau mata orang.",
  },
  {
    key: "quality",
    label: "Quality",
    route: "/quality",
    kind: "not_auditable",
    onlyEvidence: "Sengaja tak menulis audit (K-07). Bukti hanya: log Railway (200 /api/quality) atau mata orang.",
  },
];

export interface ScreenStatus {
  key: string;
  label: string;
  route: string;
  kind: "auditable" | "not_auditable";
  status: VStatus;
  /** Observed occurrences of the signal (0 for not_auditable). */
  count: number;
  /** Last time the signal appeared, ISO, or null. */
  lastAt: string | null;
  /** Actor (staff email) of the most recent occurrence, or null. Staff only — audit rows
   *  are always written by a logged-in CRM user, never a customer. */
  lastActor: string | null;
  onlyEvidence?: string;
}

/** Pure classifier: given a screen's kind and how many matching rows exist, the status.
 *  Kept pure so the proven/unproven/not_auditable rule has a test. */
export function classifyScreen(kind: "auditable" | "not_auditable", count: number): VStatus {
  if (kind === "not_auditable") return "not_auditable";
  return count > 0 ? "proven" : "unproven";
}

interface AuditRowLite {
  action: string;
  target_table: string | null;
  actor_email: string | null;
  occurred_at: string | null;
}

/** Max audit rows scanned to derive status. crm_audit_log is kept small (operational
 *  rows purge after 90 days); this cap only bounds a pathological table. If it is ever
 *  hit, counts become "at least N" — existence (proven) is still correct. */
const SCAN_CAP = 5000;

/**
 * Compute each screen's live status from crm_audit_log. READ-ONLY: one SELECT, no writes.
 * The caller (the diagnostic route) owns auth + its own self-audit; this only reads.
 */
export async function computeVerificationStatus(admin: SupabaseClient): Promise<ScreenStatus[]> {
  const { data, error } = await admin
    .from("crm_audit_log")
    .select("action, target_table, actor_email, occurred_at")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(SCAN_CAP);
  if (error) throw error;
  const rows = (data ?? []) as AuditRowLite[];

  // Group by `action::target_table`; rows are newest-first, so the first seen per key is
  // the latest occurrence.
  const byKey = new Map<string, { count: number; lastAt: string | null; lastActor: string | null }>();
  for (const r of rows) {
    const k = `${r.action}::${r.target_table ?? ""}`;
    const cur = byKey.get(k);
    if (cur) {
      cur.count += 1;
    } else {
      byKey.set(k, { count: 1, lastAt: r.occurred_at, lastActor: r.actor_email });
    }
  }

  return SCREENS.map((s) => {
    if (s.kind === "not_auditable") {
      return {
        key: s.key,
        label: s.label,
        route: s.route,
        kind: s.kind,
        status: "not_auditable" as const,
        count: 0,
        lastAt: null,
        lastActor: null,
        onlyEvidence: s.onlyEvidence,
      };
    }
    const sig = byKey.get(`${s.signal!.action}::${s.signal!.targetTable}`);
    const count = sig?.count ?? 0;
    return {
      key: s.key,
      label: s.label,
      route: s.route,
      kind: s.kind,
      status: classifyScreen(s.kind, count),
      count,
      lastAt: sig?.lastAt ?? null,
      lastActor: sig?.lastActor ?? null,
    };
  });
}
