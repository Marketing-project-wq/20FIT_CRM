import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStagingImportDob, fetchStagingRfm } from "./staging";
import {
  fetchContactCoverage,
  fetchUnitSpread,
  fetchEventRegistrations,
  type ContactCoverage,
  type UnitCount,
  type ProductCount,
} from "./dashboard-viz";
import { fetchLiveSourceGaps, type SourceGap } from "./dashboard-sources";
import { fetchMirrorMeta } from "./mirror";

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
 * TWO contactable counts, deliberately separate (Migrasi 11): marketing contact and service
 * (transactional) contact are DIFFERENT permissions — CS phones customers for service, which
 * is not marketing. Collapsing them would hide exactly the distinction the backfill records.
 *
 * DASHBOARD USES THE RPC, SEGMENT USES THE EMBED — do not merge the two paths:
 *   - Dashboard (here): no criteria → calls crm_contactable_counts() (Migrasi 13). That RPC
 *     does DISTINCT-then-anti-join with a per-transaction work_mem, ~2.9s embed → ~0.5-1.3s.
 *     It cannot narrow by criteria; it is the unrestricted count only.
 *   - Segment builder (lib/crm/segment-read.ts): criteria live on master_customer, so it MUST
 *     join (the inner embed). The RPC can't express criteria. Different queries, on purpose.
 * Suppression is subtracted INSIDE the RPC (K-03/K-26, per-identity → whole profile, all
 * purposes), matching isContactableForPurpose — so the two never diverge.
 */
export interface DashboardStats {
  /** Rows in master_customer. Real, sourced. */
  audienceSize: number;
  /** Contactable-for-MARKETING: distinct profiles with an active marketing consent AND not
   *  suppressed. From crm_contactable_counts() (Migrasi 13). */
  contactableMarketing: number;
  /** Contactable-for-SERVICE (transactional): same rule, purpose='transactional'. */
  contactableService: number;
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
  /** Mirror freshness: when the snapshot was last refreshed, and its row count. */
  mirror: { refreshedAt: string | null; rowCount: number | null };
}

interface ContactableCounts {
  marketing?: number;
  transactional?: number;
}

/**
 * PROGRESSIVE LOADING (Dashboard progressive-load sprint). The dashboard is split into blocks by
 * COST so the cheap figures paint in ~250ms instead of waiting on the ~2.9s contactable RPC and
 * the ~20-page event tally. Each block is an independent fetch (its own loading boundary + its own
 * failure state on screen). The blocks are:
 *   - IMMEDIATE: pool size, last-load date, contact coverage, import DOB — all head:true counts.
 *   - CONTACTABLE: the live RPC — kept live (never precomputed: a stale "contactable" would say a
 *     person can be reached who has just asked to stop).
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
}
export interface ContactableBlock {
  contactableMarketing: number;
  contactableService: number;
}
export interface MirrorBlock {
  unitSpread: UnitCount[];
  importRfm: { value: string; count: number }[];
  mirror: { refreshedAt: string | null; rowCount: number | null };
}
export interface EventsBlock {
  eventRegistrations: ProductCount[];
}
export interface SourcesBlock {
  liveSources: SourceGap[];
}

export type DashboardBlockName = "immediate" | "contactable" | "mirror" | "events" | "sources";

/** IMMEDIATE — the cheap head:true counts, all in parallel. Throws on error so the block shows a
 *  failure state; these are the most reliable queries on the page. */
export async function fetchImmediateBlock(admin: SupabaseClient): Promise<ImmediateBlock> {
  const [size, fresh, contactCoverage, importDob] = await Promise.all([
    admin.from("master_customer").select("*", { count: "exact", head: true }),
    admin
      .from("master_customer")
      .select("created_at")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    fetchContactCoverage(admin),
    fetchStagingImportDob(admin),
  ]);
  if (size.error) throw size.error;
  if (fresh.error) throw fresh.error;
  return {
    audienceSize: size.count ?? 0,
    lastProfileAt: (fresh.data as { created_at: string | null } | null)?.created_at ?? null,
    contactCoverage,
    importDob,
  };
}

/** CONTACTABLE — the live RPC (Migrasi 13). ALWAYS returns both keys (0 = measured zero, K-08). */
export async function fetchContactableBlock(admin: SupabaseClient): Promise<ContactableBlock> {
  const { data, error } = await admin.rpc("crm_contactable_counts");
  if (error) throw error;
  const c = (data ?? {}) as ContactableCounts;
  return { contactableMarketing: c.marketing ?? 0, contactableService: c.transactional ?? 0 };
}

/** MIRROR — the snapshot block: unit spread + RFM + freshness, in parallel. */
export async function fetchMirrorBlock(admin: SupabaseClient): Promise<MirrorBlock> {
  const [unitSpread, importRfm, mirrorMeta] = await Promise.all([
    fetchUnitSpread(admin),
    fetchStagingRfm(admin),
    fetchMirrorMeta(admin),
  ]);
  return { unitSpread, importRfm, mirror: { refreshedAt: mirrorMeta.refreshedAt, rowCount: mirrorMeta.rowCount } };
}

/** EVENTS — the live per-product registration tally (the ~20-page read). */
export async function fetchEventsBlock(admin: SupabaseClient): Promise<EventsBlock> {
  return { eventRegistrations: await fetchEventRegistrations(admin) };
}

/** SOURCES — the per-source live gap vs the frozen pool (each source already runs in parallel). */
export async function fetchSourcesBlock(admin: SupabaseClient): Promise<SourcesBlock> {
  return { liveSources: await fetchLiveSourceGaps(admin) };
}

/** All blocks composed — the fixture type + any caller that wants the whole thing at once. */
export async function fetchDashboardStats(admin: SupabaseClient): Promise<DashboardStats> {
  const [immediate, contactable, mirror, events, sources] = await Promise.all([
    fetchImmediateBlock(admin),
    fetchContactableBlock(admin),
    fetchMirrorBlock(admin),
    fetchEventsBlock(admin),
    fetchSourcesBlock(admin),
  ]);
  return {
    audienceSize: immediate.audienceSize,
    contactableMarketing: contactable.contactableMarketing,
    contactableService: contactable.contactableService,
    lastProfileAt: immediate.lastProfileAt,
    importDob: immediate.importDob,
    importRfm: mirror.importRfm,
    contactCoverage: immediate.contactCoverage,
    unitSpread: mirror.unitSpread,
    eventRegistrations: events.eventRegistrations,
    liveSources: sources.liveSources,
    mirror: mirror.mirror,
  };
}
