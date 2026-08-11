/**
 * Shapes + PURE helpers for the data-quality dashboard.
 *
 * Deliberately NOT `server-only`: the client component imports the field catalogue
 * and the formatting/tone helpers. The query code (service role) lives in
 * lib/crm/quality.ts, which IS server-only. Same split as audience-constants.ts.
 *
 * HONESTY RULES encoded here (Sprint 3A carried forward):
 *   - "terisi" means NOT NULL, nothing else. Verified 2026-08-11: master_customer
 *     holds no empty-string values in these columns, so NULL is the whole story and
 *     a second "" test would only add a claim we cannot express in PostgREST.
 *   - A field at 0% is REPORTED at 0%, never hidden and never omitted from the list.
 *   - Counts are never rounded away: the raw number sits next to every percentage.
 */

/** Status tones available in the design system (PRD §18.6). No new colours. */
export type Tone = "red" | "amber" | "green" | "neutral";

/** One row of the fill-rate table. */
export interface FillRate {
  key: string;
  /** Human label, Indonesian — this is an internal Indonesian-language tool. */
  label: string;
  /** The physical column the number came from, shown in mono so it is auditable. */
  column: string;
  filled: number;
  /** Why this field matters / what blocks it. Shown when the rate is poor. */
  note?: string;
}

/** A single "how many rows are wrong" figure. */
export interface IssueCount {
  key: string;
  label: string;
  count: number;
  /** Exactly what was counted — the definition, not a vibe. */
  definition: string;
}

/** Coverage of a crm_* satellite table against the master profile count. */
export interface SatelliteCoverage {
  key: string;
  label: string;
  table: string;
  rows: number;
  note: string;
}

export interface QualitySnapshot {
  /** Rows in master_customer — the denominator for every percentage below. */
  total: number;
  fillRates: FillRate[];
  identifiers: IssueCount[];
  anomalies: IssueCount[];
  duplicates: IssueCount[];
  queues: IssueCount[];
  satellites: SatelliteCoverage[];
  /** ISO timestamp the snapshot was computed. Never cached. */
  computedAt: string;
}

/** Percentage of `n` out of `total`, or 0 when there is nothing to divide by. */
export function pct(n: number, total: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(total) || total <= 0) return 0;
  return (n / total) * 100;
}

/**
 * Tone for a fill rate. Thresholds are OURS, not the PRD's — the PRD does not set
 * data-quality SLAs yet. They are here so the screen is readable, and they are
 * documented as provisional rather than presented as policy.
 *   ≥ 95% green · ≥ 60% amber · below that red.
 */
export function fillTone(rate: number): Tone {
  if (rate >= 95) return "green";
  if (rate >= 60) return "amber";
  return "red";
}

/**
 * Tone for a defect count. Deliberately only green (nothing wrong) or amber
 * (something to look at) — NEVER red. Red would claim a severity threshold the PRD
 * has not defined, and inventing one here would turn a guess into a policy.
 */
export function issueTone(count: number): Tone {
  return count === 0 ? "green" : "amber";
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function formatPct(rate: number): string {
  // Two decimals: 7,03% and 1,35% are the difference between "some" and "almost none".
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate)}%`;
}

/**
 * Findings that are TRUE but cannot be recomputed live through PostgREST, which has
 * no column-to-column comparison and no regex filter. They are stated with the date
 * they were verified against the database, so nobody mistakes them for live numbers.
 * If one of these is ever needed live, it needs a SQL view — not a fudged filter.
 */
export const VERIFIED_ARTIFACTS = [
  {
    key: "last_activity",
    label: "“Terakhir aktif” bukan data aktivitas",
    detail:
      "81.944 dari 82.253 baris (99,62%) punya last_activity_at yang persis sama dengan first_seen_at — artefak impor, bukan jejak aktivitas. Kolom ini sengaja tidak ditampilkan di mana pun.",
  },
  {
    key: "segment_inverted",
    label: "Segment terbalik",
    detail:
      "1.242 profil tanpa segment (NULL) justru memiliki rata-rata lifetime value tertinggi. Ditampilkan apa adanya; tidak ada aturan yang “merapikan” ini.",
  },
  // NOTE: `phone_canonical_gap` sengaja DIHAPUS di Sprint 3B (2026-08-11). Temuan itu
  // sudah DIPERBAIKI — normalizePhoneID() kini menghasilkan `62…` tanpa `+`, cocok
  // dengan master_customer. Temuan yang sudah ditutup tidak boleh terus tampil di layar
  // sebagai temuan aktif. Riwayatnya ada di normalize.ts dan normalize.test.ts.
] as const;

/** Date the artifacts above were checked against the live database. */
export const ARTIFACTS_VERIFIED_ON = "11 Agustus 2026";
