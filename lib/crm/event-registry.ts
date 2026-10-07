import "server-only";

/**
 * Event registry — admin-curated grouping for Event Analysis.
 *
 * Tables (service_role only, see supabase/migrations/20261007090000_crm_event_registry.sql):
 *   crm_event_registry        — one row per real event
 *   crm_event_registry_tags   — which event:* tags belong to each event
 *
 * This module is the single data layer for the registry: fetch it, fetch per-tag
 * participant counts, and derive the grouping that lib/crm/event-analytics.ts applies.
 * Everything here uses the admin (service_role) client — RLS forbids the anon client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const PAGE = 1000;

export interface EventRegistryEntry {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  eventDate: string | null;
  isActive: boolean;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One event:* tag with its participant count and (if any) the event it is assigned to. */
export interface EventTagStat {
  slug: string;
  label: string;
  count: number;
  assignedEventId: string | null;
  assignedEventName: string | null;
}

interface RegistryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  event_date: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RegistryTagRow {
  event_id: string;
  tag_slug: string;
}

/** Same slug derivation customer_engagement.product → tag that event-analytics uses. */
function productToSlug(product: string): string {
  return "event:" + product.toLowerCase().replace(/\s+/g, "-");
}

function formatSlugLabel(slug: string): string {
  const value = slug.includes(":") ? slug.slice(slug.indexOf(":") + 1) : slug;
  return value
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Fetch the full registry (events + their tag slugs). Ordered by event_date (nulls last),
 * then name — the same chronological intent the analytics page sorts groups by. Returns [] on
 * a missing table so callers can fall back to auto-grouping before the migration is run.
 */
export async function fetchEventRegistry(admin: AdminClient): Promise<EventRegistryEntry[]> {
  const { data: eventRows, error: evErr } = (await admin
    .from("crm_event_registry")
    .select("id, name, slug, description, event_date, is_active, created_by, created_at, updated_at")
    .order("event_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })) as unknown as { data: RegistryRow[] | null; error: unknown };

  // Missing table (migration not run yet) or any read error → no registry → auto-grouping.
  if (evErr || !eventRows) return [];

  const { data: tagRows, error: tagErr } = (await admin
    .from("crm_event_registry_tags")
    .select("event_id, tag_slug")) as unknown as { data: RegistryTagRow[] | null; error: unknown };

  // A failed tag read must not be mistaken for "no assignments" (T-69): on error, return the
  // events with empty tag lists rather than silently treating every tag as unassigned.
  const tagsByEvent = new Map<string, string[]>();
  if (!tagErr) {
    for (const r of tagRows ?? []) {
      const arr = tagsByEvent.get(r.event_id) ?? [];
      arr.push(r.tag_slug);
      tagsByEvent.set(r.event_id, arr);
    }
  }

  return eventRows.map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    description: e.description,
    eventDate: e.event_date,
    isActive: e.is_active,
    tags: (tagsByEvent.get(e.id) ?? []).slice().sort(),
    createdBy: e.created_by,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  }));
}

/**
 * Map every event:* tag → the set of distinct customer_ids that carry it, merged from the
 * same two sources Event Analysis uses: master_customer.tags[] and customer_engagement
 * (unit='event'). Union sizes give per-event totals; individual sizes give per-tag counts.
 */
export async function fetchEventTagParticipants(admin: AdminClient): Promise<Map<string, Set<string>>> {
  const byTag = new Map<string, Set<string>>();
  const add = (tag: string, cid: string) => {
    let set = byTag.get(tag);
    if (!set) { set = new Set(); byTag.set(tag, set); }
    set.add(cid);
  };

  // Source A: master_customer event tags.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id, tags")
      .range(from, from + PAGE - 1);
    if (error) break; // on read error, return what we have (counts are informational)
    const rows = (data ?? []) as { customer_id: string; tags: string[] | null }[];
    for (const row of rows) {
      if (!row.customer_id || !row.tags) continue;
      for (const tag of row.tags) {
        if (tag.startsWith("event:")) add(tag, row.customer_id);
      }
    }
    if (rows.length < PAGE) break;
  }

  // Source B: customer_engagement, unit='event'.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_engagement")
      .select("customer_id, product")
      .eq("unit", "event")
      .range(from, from + PAGE - 1);
    if (error) break;
    const rows = (data ?? []) as { customer_id: string; product: string | null }[];
    for (const r of rows) {
      if (!r.customer_id || !r.product) continue;
      add(productToSlug(r.product), r.customer_id);
    }
    if (rows.length < PAGE) break;
  }

  return byTag;
}

/** A registry event with its distinct-participant total (union across its tags). */
export interface EventRegistryEntryWithTotal extends EventRegistryEntry {
  total: number;
}

/** Everything the Event Registry Manager needs in one read. */
export interface EventRegistryView {
  events: EventRegistryEntryWithTotal[];
  tags: EventTagStat[];
}

/**
 * Distinct participant total for a registry event = size of the union of its tags' participant
 * sets. Computed from a shared participants map so the manager and analytics agree.
 */
export function eventTotalFromTags(tags: readonly string[], participants: Map<string, Set<string>>): number {
  const union = new Set<string>();
  for (const tag of tags) {
    const set = participants.get(tag);
    if (set) set.forEach((cid) => union.add(cid));
  }
  return union.size;
}

/**
 * Build the whole manager view in ONE pass over the data: the registry (events + totals) and the
 * per-tag stat list (every event:* tag known to the tag registry OR present in participant data,
 * with its distinct-person count and the event it is assigned to, if any). Participants are counted
 * once and shared. Labels come from crm_tag_registry where available, else a prettified slug.
 */
export async function fetchEventRegistryView(admin: AdminClient): Promise<EventRegistryView> {
  const registry = await fetchEventRegistry(admin);
  const participants = await fetchEventTagParticipants(admin);

  // Labels from the tag registry (event namespace).
  const labelMap = new Map<string, string>();
  const { data: regRows, error: regErr } = (await admin
    .from("crm_tag_registry")
    .select("slug, label")
    .eq("namespace", "event")) as unknown as { data: { slug: string; label: string | null }[] | null; error: unknown };
  // Labels are cosmetic — on a failed read fall back to prettified slugs rather than failing the view.
  if (!regErr) {
    for (const r of regRows ?? []) {
      labelMap.set(r.slug, r.label ?? formatSlugLabel(r.slug));
    }
  }

  // Which event owns which tag.
  const assignment = new Map<string, { id: string; name: string }>();
  for (const ev of registry) {
    for (const tag of ev.tags) assignment.set(tag, { id: ev.id, name: ev.name });
  }

  // Union of every known tag: registry labels, participant data, and assigned tags
  // (an assigned tag with no current participants must still show as assigned).
  const allSlugs = new Set<string>();
  labelMap.forEach((_v, slug) => allSlugs.add(slug));
  participants.forEach((_v, slug) => allSlugs.add(slug));
  assignment.forEach((_v, slug) => allSlugs.add(slug));

  const tags: EventTagStat[] = [];
  allSlugs.forEach((slug) => {
    const owner = assignment.get(slug) ?? null;
    tags.push({
      slug,
      label: labelMap.get(slug) ?? formatSlugLabel(slug),
      count: participants.get(slug)?.size ?? 0,
      assignedEventId: owner?.id ?? null,
      assignedEventName: owner?.name ?? null,
    });
  });
  tags.sort((a, b) => (b.count - a.count) || a.slug.localeCompare(b.slug));

  const events: EventRegistryEntryWithTotal[] = registry.map((ev) => ({
    ...ev,
    total: eventTotalFromTags(ev.tags, participants),
  }));

  return { events, tags };
}
