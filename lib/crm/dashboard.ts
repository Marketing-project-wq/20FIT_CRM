import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reach, Load } from "./bod";
import { fetchReach, fetchLoadHistory } from "./reach-live";
import { fetchStagingImportDob } from "./staging";
import { STAGING_RFM_VALUES } from "./staging-constants";
import {
  fetchContactCoverage,
  fetchShopProfilesLive,
  fetchEventRegistrations,
  fetchTagEventCounts,
  type ContactCoverage,
  type UnitCount,
  type ProductCount,
} from "./dashboard-viz";
import { fetchLiveSourceGaps, fetchCandidateAsOf, type SourceGap } from "./dashboard-sources";
import { fetchMirrorDashboardStats, type MirrorDashboardStats } from "./mirror";

/** The 5 ecosystem units the mirror precompute (dashboard_stats.engagement) carries, in a FIXED
 *  order so a unit is never dropped just because the blob happens not to key it. */
export const MIRROR_ENGAGEMENT_UNITS = ["membership", "event", "arena", "clinic", "gym"] as const;

/**
 * Build the unit-spread rows from the precompute engagement block + the live `shop` count. Every
 * mirror unit ALWAYS appears (from the closed list above; a missing key reads as 0-measured, K-08),
 * and `shop` is appended as a live row. Sorted by profiles desc — pure, so it has a test.
 */
export function unitSpreadFromEngagement(
  engagement: Record<string, number>,
  shopProfiles: number,
): UnitCount[] {
  const rows: UnitCount[] = MIRROR_ENGAGEMENT_UNITS.map((unit) => ({
    unit,
    profiles: Number(engagement[unit] ?? 0),
    source: "mirror" as const,
  }));
  rows.push({ unit: "shop", profiles: shopProfiles, source: "live" });
  return rows.sort((a, b) => b.profiles - a.profiles);
}

/**
 * RFM spread from the precompute, expanded against the CLOSED vocabulary. THE POINT (K-08): the
 * precompute's `buckets` are a GROUP BY, so a bucket with zero rows is simply ABSENT — e.g.
 * "Campion user" (1 person in staging, 0 matched into the mirror) has no row. Building the display
 * list from the blob's buckets would make that category VANISH from the screen instead of showing
 * 0. So every closed-vocabulary value is listed unconditionally (0 when absent), the stored
 * misspelling "Campion user" is kept verbatim, and the "no bucket" total (`-`) is appended. Pure.
 */
export function rfmFromPrecompute(rfm: MirrorDashboardStats["rfm"]): { value: string; count: number }[] {
  const byLabel = new Map((rfm.buckets ?? []).map((b) => [b.label, Number(b.count) || 0]));
  const named = STAGING_RFM_VALUES.map((value) => ({ value, count: byLabel.get(value) ?? 0 }));
  const rows = [...named, { value: "-", count: Number(rfm.tanpa) || 0 }];
  return rows.sort((a, b) => b.count - a.count);
}

/**
 * Dashboard KPI stats — READ-ONLY aggregates over master_customer + crm_consent +
 * crm_suppression. Server-only, service-role client passed in by the caller (which owns auth
 * + RBAC), no write path. No individual customer row is exposed (only counts), so nothing to
 * mask and no per-view audit.
 *
 * The `—` vs `0` distinction is enforced at the UI, but the SHAPE supports it: a field this
 * layer cannot source is absent from the type. Both contactable counts are MEASURED, not
 * hardcoded literals.
 *
 * REACH REPLACED THE TWO CONSENT COUNTS (7 Sep 2026). The dashboard used to show
 * "Contactable · marketing" and "Contactable · service" from crm_contactable_counts(). Both were
 * 82,253 — not by coincidence but by construction: migration 11 backfilled a marketing AND a
 * transactional consent row for the same people, so the card printed one fact twice. Worse, the
 * "service" label named a purpose the schema does not have: crm_consent_purpose_check admits
 * `marketing` and `transactional` only, and zero rows carry anything else (verified 7 Sep 2026).
 * What the screen now answers instead is the question actually being asked — how many people can
 * we reach, and on which channel — measured from the identities and the suppression list.
 *
 * The SEGMENT BUILDER still uses the consent-purpose counts (lib/crm/segment-read.ts): there the
 * criteria live on master_customer so it must join, and the two purposes are a real distinction
 * for a per-segment permission question. Different screen, different question, left alone.
 */
export interface DashboardStats {
  /** Rows in master_customer. Real, sourced. */
  audienceSize: number;
  /** Workflow rows, and how many enrolments are still queued behind them. */
  workflowCount: number;
  workflowQueued: number;
  /** Every load, discovered from created_at (see fetchLoadHistory for why not first_seen_at). */
  loads: Load[];
  loadsTruncated: boolean;
  /** Profiles with an email that no active suppression covers. */
  emailable: number;
  /** Profiles with a phone that no active suppression covers. */
  whatsappable: number;
  /** DISTINCT people the provider has ever accepted a message for. */
  everContacted: number;
  /** Most recent created_at, or null if the table is empty. Data FRESHNESS, not a growth
   *  signal — master_customer arrived as batch loads, not a live feed. */
  lastProfileAt: string | null;
  /** staging_20fit_data rows carrying a birth date (master_customer has 0 — Sprint 3Y). The
   *  distinct match to profiles (98,6%) is a dated artifact, referenced in the card hint. */
  importDob: number;
  /** RFM ("per paid order") spread incl the "-" absence bucket (0 = measured zero, K-08). */
  importRfm: { value: string; count: number }[];
  /** LIVE contact-coverage split over master_customer (email/phone combinations). */
  contactCoverage: ContactCoverage;
  /** Distinct profiles per ecosystem unit. Snapshot for the 5 mirror units, live for shop. */
  unitSpread: UnitCount[];
  /** Registrations per event product (live row tally, not distinct people). */
  eventRegistrations: ProductCount[];
  /** Per-source: people in the live source vs how many are not yet in the frozen pool. LIVE. */
  liveSources: SourceGap[];
  /** Deduped candidates not yet in the pool (snapshot) + per-source split. DIFFERENT population
   *  from liveSources (per-source, live) — labelled distinctly on screen. */
  candidates: { total: number; bySource: { source: string; count: number }[] };
  /** The candidate DATA's own "as of" instant (newest crm_identity_candidate.first_seen_at). NOT the
   *  mirror refresh time: the count is re-computed nightly but the underlying table is frozen, so the
   *  card judges freshness from this, not from when the COUNT last ran. LIVE, cheap (limit-1). */
  candidatesAsOf: string | null;
  /** Fitco participation (snapshot): matched into the pool vs not. */
  fitco: { matched: number; unmatched: number };
  /** Mirror freshness: when the snapshot was last refreshed, and its row count. */
  mirror: { refreshedAt: string | null; rowCount: number | null };
}

/**
 * PROGRESSIVE LOADING (Dashboard progressive-load sprint). The dashboard is split into blocks by
 * COST so the cheap figures paint in ~250ms instead of waiting on the expensive blocks. Each block
 * is an independent fetch (its own loading boundary + its own failure state on screen). The blocks:
 *   - IMMEDIATE: pool size, contact coverage, import DOB, the workflow figures, and the LOAD
 *     HISTORY — the last one because three captions used to state the number of loads and their
 *     dates as literal text, and every one of them had gone out of date (K-60).
 *   - REACH: live counts — never precomputed: a stale reach figure would say a person can be
 *     reached who has just asked to stop.
 *   - MIRROR (snapshot): unit spread + RFM + mirror refreshed_at — the block carries its freshness.
 *   - EVENTS: the live per-product registration tally.
 *   - SOURCES: the per-source live gap vs the frozen pool.
 * fetchDashboardStats is retained (it composes the blocks) for the fixture type + any all-at-once
 * caller; the route serves ONE block per request via `?block=`.
 */
export interface ImmediateBlock {
  audienceSize: number;
  lastProfileAt: string | null;
  contactCoverage: ContactCoverage;
  importDob: number;
  /** Rows in crm_workflow. The card used to be a hard `—` with the hint "no workflow table yet";
   *  the table has existed since 27 Aug 2026 and holds a workflow with people waiting in it. */
  workflowCount: number;
  /** Enrolments sitting in `queued` — people a workflow has lined up but not yet sent to. */
  workflowQueued: number;
  /** Every load, discovered from created_at. The caption that said "2 loads: 20 Apr & 31 Jul"
   *  is now rendered FROM this array, so it cannot go stale again. */
  loads: Load[];
  /** The discovery walk hit its cap — `loads` is a prefix, and the screen must say so. */
  loadsTruncated: boolean;
}
/**
 * REACH — replaces the old "Contactable · marketing" / "Contactable · service" pair, which was
 * wrong twice over (see lib/crm/bod.ts for the full account): the two numbers were identical by
 * construction because migration 11 backfilled both purposes for the same people, and "service"
 * is not a value crm_consent's purpose CHECK admits at all — the card named a category the system
 * does not have. Email and WhatsApp reach are counted separately and never merged; the gap between
 * them is real people with one identity and not the other.
 */
export type ReachBlock = Reach;
export interface MirrorBlock {
  unitSpread: UnitCount[];
  importRfm: { value: string; count: number }[];
  /** Deduped people across source systems NOT yet in the pool (snapshot). DIFFERENT population from
   *  SourcesBlock.liveSources (which is per-source, live) — the two are shown side by side, each
   *  labelled with what it counts + its freshness (candidates = snapshot, gap = live). */
  candidates: { total: number; bySource: { source: string; count: number }[] };
  /** The candidate data's own newest-row instant — see DashboardStats.candidatesAsOf. The card shows
   *  THIS as the candidate freshness, not the mirror refresh time. */
  candidatesAsOf: string | null;
  /** Fitco participation (snapshot): matched into the pool vs not. */
  fitco: { matched: number; unmatched: number };
  mirror: { refreshedAt: string | null; rowCount: number | null };
}
export interface EventsBlock {
  eventRegistrations: ProductCount[];
}
export interface SourcesBlock {
  liveSources: SourceGap[];
}

export type DashboardBlockName = "immediate" | "reach" | "mirror" | "events" | "sources";

/** IMMEDIATE — the cheap head:true counts, all in parallel. Throws on error so the block shows a
 *  failure state; these are the most reliable queries on the page. */
export async function fetchImmediateBlock(admin: SupabaseClient): Promise<ImmediateBlock> {
  const [size, fresh, contactCoverage, importDob, wf, wfQueued, history] = await Promise.all([
    admin.from("master_customer").select("*", { count: "exact", head: true }),
    admin
      .from("master_customer")
      .select("created_at")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    fetchContactCoverage(admin),
    fetchStagingImportDob(admin),
    admin.from("crm_workflow").select("*", { count: "exact", head: true }),
    admin.from("crm_workflow_enrollment").select("*", { count: "exact", head: true }).eq("status", "queued"),
    fetchLoadHistory(admin),
  ]);
  if (size.error) throw size.error;
  if (fresh.error) throw fresh.error;
  if (wf.error) throw wf.error;
  if (wfQueued.error) throw wfQueued.error;
  return {
    audienceSize: size.count ?? 0,
    lastProfileAt: (fresh.data as { created_at: string | null } | null)?.created_at ?? null,
    contactCoverage,
    importDob,
    workflowCount: wf.count ?? 0,
    workflowQueued: wfQueued.count ?? 0,
    loads: history.loads,
    loadsTruncated: history.truncated,
  };
}

/** REACH — live, never precomputed: a stale reach figure would say a person can be reached who has
 *  just asked to stop. Each number is counted here and now (K-60). */
export async function fetchReachBlock(admin: SupabaseClient): Promise<ReachBlock> {
  return fetchReach(admin);
}

/**
 * MIRROR — the snapshot block, now served from the PRECOMPUTE (dashboard_stats). One blob read
 * (~0.14ms) replaces the five per-unit matview COUNT scans (~55ms each) AND the five staging RFM
 * COUNT scans (~249ms each). `shop` has no precompute column, so it stays a live count (tiny). The
 * reader fails hard if the precompute is absent (never zeros — see fetchMirrorDashboardStats), so
 * this block shows its own failure state rather than fake all-zero unit/RFM figures. RFM is
 * expanded against the closed vocabulary so a zero bucket (Campion user) shows 0, never vanishes.
 */
export async function fetchMirrorBlock(admin: SupabaseClient): Promise<MirrorBlock> {
  // candidatesAsOf is a LIVE limit-1 read (the candidate count is precomputed, but its freshness is
  // the data's own newest-row age — see fetchCandidateAsOf). It rides alongside the two existing
  // reads here, the same way fetchShopProfilesLive already mixes one live count into this block.
  const [stats, shopProfiles, candidatesAsOf] = await Promise.all([
    fetchMirrorDashboardStats(admin),
    fetchShopProfilesLive(admin),
    fetchCandidateAsOf(admin),
  ]);
  return {
    unitSpread: unitSpreadFromEngagement(stats.engagement, shopProfiles),
    importRfm: rfmFromPrecompute(stats.rfm),
    candidates: candidatesFromPrecompute(stats.candidates),
    candidatesAsOf,
    fitco: { matched: Number(stats.fitco.matched ?? 0), unmatched: Number(stats.fitco.unmatched ?? 0) },
    mirror: { refreshedAt: stats.refreshedAt, rowCount: stats.rowCount },
  };
}

/** Candidate breakdown from the precompute — total + per-source, sorted desc. Pure. The per-source
 *  keys are precompute source names (e.g. `event_transaction`), kept verbatim; the UI labels them. */
export function candidatesFromPrecompute(
  c: MirrorDashboardStats["candidates"],
): { total: number; bySource: { source: string; count: number }[] } {
  const bySource = Object.entries(c.by_source ?? {})
    .map(([source, count]) => ({ source, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count);
  return { total: Number(c.total) || 0, bySource };
}

/** Merge engagement registrations and tag-based event counts. Tag entries whose label already
 *  appears in the engagement list are folded in (counts added); the rest are appended. */
export function mergeEventSources(engagement: ProductCount[], tags: ProductCount[]): ProductCount[] {
  const merged = new Map<string, number>();
  const lower = new Map<string, string>();
  for (const e of engagement) {
    const key = e.product.toLowerCase();
    merged.set(key, (merged.get(key) ?? 0) + e.registrations);
    if (!lower.has(key)) lower.set(key, e.product);
  }
  for (const t of tags) {
    const key = t.product.toLowerCase();
    merged.set(key, (merged.get(key) ?? 0) + t.registrations);
    if (!lower.has(key)) lower.set(key, t.product);
  }
  return Array.from(merged.entries())
    .map(([key, registrations]) => ({ product: lower.get(key)!, registrations }))
    .sort((a, b) => b.registrations - a.registrations);
}

/** EVENTS — engagement registrations + tag-based event counts, merged and sorted. */
export async function fetchEventsBlock(admin: SupabaseClient): Promise<EventsBlock> {
  const [engagement, tags] = await Promise.all([
    fetchEventRegistrations(admin),
    fetchTagEventCounts(admin),
  ]);
  return { eventRegistrations: mergeEventSources(engagement, tags) };
}

/** SOURCES — the per-source live gap vs the frozen pool (each source already runs in parallel). */
export async function fetchSourcesBlock(admin: SupabaseClient): Promise<SourcesBlock> {
  return { liveSources: await fetchLiveSourceGaps(admin) };
}

/** All blocks composed — the fixture type + any caller that wants the whole thing at once. */
export async function fetchDashboardStats(admin: SupabaseClient): Promise<DashboardStats> {
  const [immediate, reach, mirror, events, sources] = await Promise.all([
    fetchImmediateBlock(admin),
    fetchReachBlock(admin),
    fetchMirrorBlock(admin),
    fetchEventsBlock(admin),
    fetchSourcesBlock(admin),
  ]);
  return {
    audienceSize: immediate.audienceSize,
    emailable: reach.emailable,
    whatsappable: reach.whatsappable,
    everContacted: reach.everContacted,
    lastProfileAt: immediate.lastProfileAt,
    importDob: immediate.importDob,
    workflowCount: immediate.workflowCount,
    workflowQueued: immediate.workflowQueued,
    loads: immediate.loads,
    loadsTruncated: immediate.loadsTruncated,
    importRfm: mirror.importRfm,
    contactCoverage: immediate.contactCoverage,
    unitSpread: mirror.unitSpread,
    eventRegistrations: events.eventRegistrations,
    liveSources: sources.liveSources,
    candidates: mirror.candidates,
    candidatesAsOf: mirror.candidatesAsOf,
    fitco: mirror.fitco,
    mirror: mirror.mirror,
  };
}
