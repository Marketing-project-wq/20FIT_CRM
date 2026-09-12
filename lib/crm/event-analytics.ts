import "server-only";

/**
 * Event analytics — all computations for the "Analisa Event" page.
 *
 * Data sources (merged per person by customer_id):
 *   1. customer_engagement WHERE unit='event' — per-person rows (customer_id + product)
 *   2. master_customer.tags[] — every "event:xxx" tag
 *   3. crm_tag_registry — labels for event tags
 *
 * Both per-person sources are normalized to "event:xxx" slug format and unioned so a
 * person appearing in either (or both) is counted once per event. Chronological ordering
 * uses the earliest first_seen_at from customer_engagement, falling back to slug order.
 */

export interface EventInfo {
  slug: string;
  label: string;
  total: number;
  newCount: number;
  returning: number;
}

export interface CohortRow {
  cohortEvent: string;
  cohortLabel: string;
  cohortSize: number;
  retention: number[]; // percentage at +1, +2, ... positions
  retentionAbs: number[]; // absolute counts
}

export interface ChurnRow {
  event: string;
  label: string;
  total: number;
  notReturned: number;
  notReturnedPct: number;
}

export interface EventAnalyticsData {
  events: EventInfo[];
  totalPeople: number;
  returningPeople: number;
  returningPct: number;
  allEventsPeople: number;
  cohort: CohortRow[];
  churn: ChurnRow[];
  skipAfterOneReturn: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const PAGE = 1000;

export async function fetchEventAnalytics(admin: AdminClient): Promise<EventAnalyticsData> {
  // 1. Fetch tag registry labels (small table — no paging needed)
  const { data: registryRows, error: regErr } = await admin
    .from("crm_tag_registry")
    .select("slug, label")
    .eq("namespace", "event") as unknown as { data: { slug: string; label: string | null }[] | null; error: unknown };

  if (regErr) throw new Error("Failed to fetch crm_tag_registry");

  const labelMap = new Map<string, string>();
  for (const r of registryRows ?? []) {
    labelMap.set(r.slug, r.label ?? formatSlugLabel(r.slug));
  }

  // 2. Source A: master_customer event tags (paged to capture all 82K+ profiles)
  const tagsByPerson = new Map<string, string[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id, tags")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Failed to fetch master_customer");
    const rows = (data ?? []) as { customer_id: string; tags: string[] | null }[];
    for (const row of rows) {
      if (!row.tags || !row.customer_id) continue;
      const events = row.tags.filter((t: string) => t.startsWith("event:"));
      if (events.length === 0) continue;
      const existing = tagsByPerson.get(row.customer_id);
      if (existing) {
        for (const e of events) existing.push(e);
      } else {
        tagsByPerson.set(row.customer_id, events.slice());
      }
    }
    if (rows.length < PAGE) break;
  }

  // 3. Source B: customer_engagement WHERE unit='event' (paged — safe columns only,
  //    NEVER raw_value / source_row_id / period)
  const engagementByPerson = new Map<string, Set<string>>();
  const eventFirstSeen = new Map<string, string>();
  const engagementLabels = new Map<string, string>();

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_engagement")
      .select("customer_id, product, first_seen_at")
      .eq("unit", "event")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Failed to fetch customer_engagement");
    const rows = (data ?? []) as { customer_id: string; product: string | null; first_seen_at: string | null }[];
    for (const r of rows) {
      if (!r.product) continue;
      const slug = productToSlug(r.product);
      let personSet = engagementByPerson.get(r.customer_id);
      if (!personSet) { personSet = new Set(); engagementByPerson.set(r.customer_id, personSet); }
      personSet.add(slug);
      if (!engagementLabels.has(slug)) engagementLabels.set(slug, r.product);
      if (r.first_seen_at) {
        const existing = eventFirstSeen.get(slug);
        if (!existing || r.first_seen_at < existing) eventFirstSeen.set(slug, r.first_seen_at);
      }
    }
    if (rows.length < PAGE) break;
  }

  // Enrich label map: engagement product names as fallback for events not in registry
  engagementLabels.forEach((product, slug) => {
    if (!labelMap.has(slug)) labelMap.set(slug, product);
  });

  // 4. Merge both sources per person (union of customer_ids, union of events)
  const allCustomerIds = new Set<string>();
  tagsByPerson.forEach((_v, id) => allCustomerIds.add(id));
  engagementByPerson.forEach((_v, id) => allCustomerIds.add(id));

  const allEventSlugs = new Set<string>();
  type PersonEvents = string[];
  const peopleEvents: PersonEvents[] = [];

  Array.from(allCustomerIds).forEach((cid) => {
    const merged = new Set<string>();
    const tagEvents = tagsByPerson.get(cid);
    if (tagEvents) for (const e of tagEvents) merged.add(e);
    const engEvents = engagementByPerson.get(cid);
    if (engEvents) engEvents.forEach((e) => merged.add(e));
    if (merged.size === 0) return;
    const arr = Array.from(merged);
    peopleEvents.push(arr);
    for (const e of arr) allEventSlugs.add(e);
  });

  // Sort events chronologically (first_seen_at from engagement, then slug as fallback)
  const sortedEvents = Array.from(allEventSlugs).sort((a, b) => {
    const dateA = eventFirstSeen.get(a);
    const dateB = eventFirstSeen.get(b);
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.localeCompare(b);
  });

  // 5. Compute per-event stats
  const eventIndex = new Map<string, number>();
  sortedEvents.forEach((e, i) => eventIndex.set(e, i));

  const eventTotals = new Map<string, Set<number>>();
  const eventNew = new Map<string, number>();
  const eventReturning = new Map<string, number>();

  for (const slug of sortedEvents) {
    eventTotals.set(slug, new Set());
    eventNew.set(slug, 0);
    eventReturning.set(slug, 0);
  }

  const totalPeopleSet = new Set<number>();

  for (let pi = 0; pi < peopleEvents.length; pi++) {
    const events = peopleEvents[pi];
    totalPeopleSet.add(pi);

    const personEventIndices = events.map((e) => eventIndex.get(e)!).sort((a, b) => a - b);
    const firstIdx = personEventIndices[0];

    for (const e of events) {
      eventTotals.get(e)!.add(pi);
      const eIdx = eventIndex.get(e)!;
      if (eIdx === firstIdx) {
        eventNew.set(e, eventNew.get(e)! + 1);
      } else {
        eventReturning.set(e, eventReturning.get(e)! + 1);
      }
    }
  }

  const eventInfos: EventInfo[] = sortedEvents.map((slug) => ({
    slug,
    label: labelMap.get(slug) ?? formatSlugLabel(slug),
    total: eventTotals.get(slug)!.size,
    newCount: eventNew.get(slug)!,
    returning: eventReturning.get(slug)!,
  }));

  // 6. KPIs
  const totalPeople = totalPeopleSet.size;
  let returningPeople = 0;
  let allEventsPeople = 0;

  for (const events of peopleEvents) {
    const unique = new Set(events);
    if (unique.size >= 2) returningPeople++;
    if (unique.size >= sortedEvents.length && sortedEvents.length > 0) allEventsPeople++;
  }

  const returningPct = totalPeople > 0 ? Math.round((returningPeople / totalPeople) * 1000) / 10 : 0;

  // 7. Cohort retention matrix
  const cohortMap = new Map<string, number[][]>();

  for (const events of peopleEvents) {
    const personEventIndices = Array.from(new Set(events.map((e) => eventIndex.get(e)!))).sort((a, b) => a - b);
    const firstEvent = sortedEvents[personEventIndices[0]];
    if (!cohortMap.has(firstEvent)) cohortMap.set(firstEvent, []);
    cohortMap.get(firstEvent)!.push(personEventIndices);
  }

  const cohort: CohortRow[] = [];
  for (const slug of sortedEvents) {
    const people = cohortMap.get(slug) ?? [];
    if (people.length === 0) continue;
    const baseIdx = eventIndex.get(slug)!;
    const maxOffset = sortedEvents.length - 1 - baseIdx;
    const retention: number[] = [];
    const retentionAbs: number[] = [];

    for (let offset = 1; offset <= maxOffset; offset++) {
      const targetIdx = baseIdx + offset;
      const count = people.filter((p) => p.includes(targetIdx)).length;
      retentionAbs.push(count);
      retention.push(people.length > 0 ? Math.round((count / people.length) * 1000) / 10 : 0);
    }

    cohort.push({
      cohortEvent: slug,
      cohortLabel: labelMap.get(slug) ?? formatSlugLabel(slug),
      cohortSize: people.length,
      retention,
      retentionAbs,
    });
  }

  // 8. Churn
  const churn: ChurnRow[] = [];
  let skipAfterOneReturn = 0;

  for (const slug of sortedEvents) {
    const idx = eventIndex.get(slug)!;
    if (idx >= sortedEvents.length - 1) continue;

    const people = eventTotals.get(slug)!;
    let notReturned = 0;
    Array.from(people).forEach((pi) => {
      const events = peopleEvents[pi];
      const hasLater = events.some((e) => eventIndex.get(e)! > idx);
      if (!hasLater) notReturned++;
    });

    churn.push({
      event: slug,
      label: labelMap.get(slug) ?? formatSlugLabel(slug),
      total: people.size,
      notReturned,
      notReturnedPct: people.size > 0 ? Math.round((notReturned / people.size) * 1000) / 10 : 0,
    });
  }

  for (const events of peopleEvents) {
    const indices = Array.from(new Set(events.map((e) => eventIndex.get(e)!))).sort((a, b) => a - b);
    if (indices.length < 2) continue;
    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i + 1] - indices[i] > 1) {
        skipAfterOneReturn++;
        break;
      }
    }
  }

  return {
    events: eventInfos,
    totalPeople,
    returningPeople,
    returningPct,
    allEventsPeople,
    cohort,
    churn,
    skipAfterOneReturn,
  };
}

function productToSlug(product: string): string {
  return "event:" + product.toLowerCase().replace(/\s+/g, "-");
}

function formatSlugLabel(slug: string): string {
  const value = slug.includes(":") ? slug.slice(slug.indexOf(":") + 1) : slug;
  return value
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
