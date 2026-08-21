import type { SegmentCriteria } from "./segment";

/**
 * Pure, client-safe mapping for crm_customer_mirror (Sprint 5A). Split out of mirror.ts — which is
 * `server-only` — so the mapping can be unit-tested without pulling the DB layer (same split as
 * audience-constants / engagement-constants / staging-constants).
 *
 * The mirror serves EXACTLY these five source-PRESENCE flags. Everything else (recency,
 * clinic-txn, RFM, program/Fitco, ecosystem) the mirror cannot reproduce and MUST stay on its
 * live resolver — adding a criterion here would need its own mirror column plus a fresh
 * mirror-equals-live proof, so this list is deliberately closed.
 */
export const MIRROR_FLAG_COLUMN: { key: keyof SegmentCriteria; column: string }[] = [
  { key: "srcHyrox", column: "has_hyrox" },
  { key: "srcMy20fit", column: "has_my20fit" },
  { key: "srcArena", column: "has_arena" },
  { key: "srcGym", column: "has_gym" },
  { key: "srcClinicPatient", column: "has_clinic" },
];

/** Which mirror flag columns are active for these criteria, in a stable order. */
export function activeMirrorFlagColumns(c: SegmentCriteria): string[] {
  return MIRROR_FLAG_COLUMN.filter((f) => c[f.key] === true).map((f) => f.column);
}
