import "server-only";

/**
 * Event analytics — computations for the "Analisa Event" page.
 *
 * Data sources (merged per person by customer_id):
 *   1. customer_engagement WHERE unit='event'
 *   2. master_customer.tags[] event:* tags
 *   3. crm_tag_registry for labels
 *
 * Related sub-events (JHM 5K/10K/HM, Sportfest v.02 Half/Single/…) are grouped
 * by slug prefix. All KPIs, cohort retention, and churn are computed on groups.
 * Individual events are included for the expanded view.
 */

export interface EventInfo {
  slug: string;
  label: string;
  total: number;
  newCount: number;
  returning: number;
}

export interface EventGroup {
  groupKey: string;
  groupLabel: string;
  subEvents: { slug: string; label: string }[];
  total: number;
  newCount: number;
  returning: number;
}

export interface CohortRow {
  cohortEvent: string;
  cohortLabel: string;
  cohortSize: number;
  retention: number[];
  retentionAbs: number[];
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
  groups: EventGroup[];
  totalPeople: number;
  returningPeople: number;
  returningPct: number;
  frequentPeople: number;
  avgGroupsPerPerson: number;
  cohort: CohortRow[];
  churn: ChurnRow[];
  skipAfterOneReturn: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const PAGE = 1000;

export async function fetchEventAnalytics(admin: AdminClient): Promise<EventAnalyticsData> {
  // === FETCH ===

  const { data: registryRows, error: regErr } = await admin
    .from("crm_tag_registry")
    .select("slug, label")
    .eq("namespace", "event") as unknown as { data: { slug: string; label: string | null }[] | null; error: unknown };

  if (regErr) throw new Error("Failed to fetch crm_tag_registry");

  const labelMap = new Map<string, string>();
  for (const r of registryRows ?? []) {
    labelMap.set(r.slug, r.label ?? formatSlugLabel(r.slug));
  }

  // Source A: master_customer event tags (paged)
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

  // Source B: customer_engagement (paged, safe columns only —
  // NEVER raw_value / source_row_id / period)
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

  engagementLabels.forEach((product, slug) => {
    if (!labelMap.has(slug)) labelMap.set(slug, product);
  });

  // === MERGE per person ===
  const allCustomerIds = new Set<string>();
  tagsByPerson.forEach((_v, id) => allCustomerIds.add(id));
  engagementByPerson.forEach((_v, id) => allCustomerIds.add(id));

  const allEventSlugs = new Set<string>();
  const peopleEvents: string[][] = [];

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

  const sortedEvents = Array.from(allEventSlugs).sort((a, b) => {
    const dateA = eventFirstSeen.get(a);
    const dateB = eventFirstSeen.get(b);
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.localeCompare(b);
  });

  // === INDIVIDUAL EVENT STATS ===
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

  for (let pi = 0; pi < peopleEvents.length; pi++) {
    const events = peopleEvents[pi];
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

  // === GROUP EVENTS ===
  const eventToGroup = new Map<string, string>();
  for (const slug of sortedEvents) {
    eventToGroup.set(slug, eventGroupKey(slug));
  }

  const groupSubEvents = new Map<string, string[]>();
  for (const slug of sortedEvents) {
    const gk = eventToGroup.get(slug)!;
    if (!groupSubEvents.has(gk)) groupSubEvents.set(gk, []);
    groupSubEvents.get(gk)!.push(slug);
  }

  const sortedGroupKeys = Array.from(groupSubEvents.keys()).sort((a, b) => {
    const dateA = earliestDate(groupSubEvents.get(a)!, eventFirstSeen);
    const dateB = earliestDate(groupSubEvents.get(b)!, eventFirstSeen);
    if (dateA && dateB) return dateA.localeCompare(dateB);
    if (dateA) return -1;
    if (dateB) return 1;
    return a.localeCompare(b);
  });

  const groupIndex = new Map<string, number>();
  sortedGroupKeys.forEach((gk, i) => groupIndex.set(gk, i));

  // Per-person group participation + group-level new/returning
  const groupTotals = new Map<string, Set<number>>();
  const groupNew = new Map<string, number>();
  const groupReturning = new Map<string, number>();
  for (const gk of sortedGroupKeys) {
    groupTotals.set(gk, new Set());
    groupNew.set(gk, 0);
    groupReturning.set(gk, 0);
  }

  const totalPeopleSet = new Set<number>();
  const peopleGroups: string[][] = [];

  for (let pi = 0; pi < peopleEvents.length; pi++) {
    totalPeopleSet.add(pi);
    const personGroupSet = new Set<string>();
    for (const e of peopleEvents[pi]) personGroupSet.add(eventToGroup.get(e)!);
    const personGroups = Array.from(personGroupSet);
    peopleGroups.push(personGroups);

    const personGroupIndices = personGroups.map((g) => groupIndex.get(g)!).sort((a, b) => a - b);
    const firstGroupIdx = personGroupIndices[0];

    for (const g of personGroups) {
      groupTotals.get(g)!.add(pi);
      const gIdx = groupIndex.get(g)!;
      if (gIdx === firstGroupIdx) {
        groupNew.set(g, groupNew.get(g)! + 1);
      } else {
        groupReturning.set(g, groupReturning.get(g)! + 1);
      }
    }
  }

  const groups: EventGroup[] = sortedGroupKeys.map((gk) => {
    const subs = groupSubEvents.get(gk)!;
    const subLabels = subs.map((s) => labelMap.get(s) ?? formatSlugLabel(s));
    return {
      groupKey: gk,
      groupLabel: deriveGroupLabel(subLabels, gk),
      subEvents: subs.map((s, i) => ({ slug: s, label: subLabels[i] })),
      total: groupTotals.get(gk)!.size,
      newCount: groupNew.get(gk)!,
      returning: groupReturning.get(gk)!,
    };
  });

  const groupLabelMap = new Map<string, string>();
  for (const g of groups) groupLabelMap.set(g.groupKey, g.groupLabel);

  // === GROUP-LEVEL KPIs ===
  const totalPeople = totalPeopleSet.size;
  let returningPeople = 0;
  let frequentPeople = 0;
  let totalGroupCount = 0;

  for (const pg of peopleGroups) {
    const unique = new Set(pg);
    if (unique.size >= 2) returningPeople++;
    if (unique.size >= 3) frequentPeople++;
    totalGroupCount += unique.size;
  }

  const returningPct = totalPeople > 0 ? Math.round((returningPeople / totalPeople) * 1000) / 10 : 0;
  const avgGroupsPerPerson = totalPeople > 0 ? Math.round((totalGroupCount / totalPeople) * 10) / 10 : 0;

  // === GROUP-LEVEL COHORT ===
  const cohortMap = new Map<string, number[][]>();

  for (const pg of peopleGroups) {
    const indices = Array.from(new Set(pg.map((g) => groupIndex.get(g)!))).sort((a, b) => a - b);
    const firstGroup = sortedGroupKeys[indices[0]];
    if (!cohortMap.has(firstGroup)) cohortMap.set(firstGroup, []);
    cohortMap.get(firstGroup)!.push(indices);
  }

  const cohort: CohortRow[] = [];
  for (const gk of sortedGroupKeys) {
    const people = cohortMap.get(gk) ?? [];
    if (people.length === 0) continue;
    const baseIdx = groupIndex.get(gk)!;
    const maxOffset = sortedGroupKeys.length - 1 - baseIdx;
    const retention: number[] = [];
    const retentionAbs: number[] = [];

    for (let offset = 1; offset <= maxOffset; offset++) {
      const targetIdx = baseIdx + offset;
      const count = people.filter((p) => p.includes(targetIdx)).length;
      retentionAbs.push(count);
      retention.push(people.length > 0 ? Math.round((count / people.length) * 1000) / 10 : 0);
    }

    cohort.push({
      cohortEvent: gk,
      cohortLabel: groupLabelMap.get(gk) ?? formatSlugLabel(gk),
      cohortSize: people.length,
      retention,
      retentionAbs,
    });
  }

  // === GROUP-LEVEL CHURN ===
  const churn: ChurnRow[] = [];
  let skipAfterOneReturn = 0;

  for (const gk of sortedGroupKeys) {
    const idx = groupIndex.get(gk)!;
    if (idx >= sortedGroupKeys.length - 1) continue;

    const people = groupTotals.get(gk)!;
    let notReturned = 0;
    Array.from(people).forEach((pi) => {
      const hasLater = peopleGroups[pi].some((g) => groupIndex.get(g)! > idx);
      if (!hasLater) notReturned++;
    });

    churn.push({
      event: gk,
      label: groupLabelMap.get(gk) ?? formatSlugLabel(gk),
      total: people.size,
      notReturned,
      notReturnedPct: people.size > 0 ? Math.round((notReturned / people.size) * 1000) / 10 : 0,
    });
  }

  for (const pg of peopleGroups) {
    const indices = Array.from(new Set(pg.map((g) => groupIndex.get(g)!))).sort((a, b) => a - b);
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
    groups,
    totalPeople,
    returningPeople,
    returningPct,
    frequentPeople,
    avgGroupsPerPerson,
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

function eventGroupKey(slug: string): string {
  const value = slug.startsWith("event:") ? slug.slice(6) : slug;
  let key = value;
  key = key.replace(/-(2\.7k|5k|10k|21k|hm)$/i, "");
  key = key.replace(/-(half|single|doubles?|relay)$/i, "");
  key = key.replace(/-(fri|sat|sun|mon|tue|wed|thu)(-[a-z0-9]+)*$/i, "");
  return "event:" + key;
}

function earliestDate(slugs: string[], dateMap: Map<string, string>): string | undefined {
  let earliest: string | undefined;
  for (const s of slugs) {
    const d = dateMap.get(s);
    if (d && (!earliest || d < earliest)) earliest = d;
  }
  return earliest;
}

function deriveGroupLabel(subEventLabels: string[], groupKey: string): string {
  if (subEventLabels.length <= 1) return subEventLabels[0] ?? formatSlugLabel(groupKey);
  const first = subEventLabels[0];
  let prefixLen = first.length;
  for (let i = 1; i < subEventLabels.length; i++) {
    const other = subEventLabels[i];
    while (prefixLen > 0 && other.slice(0, prefixLen) !== first.slice(0, prefixLen)) {
      prefixLen--;
    }
  }
  const prefix = first.slice(0, prefixLen).trimEnd();
  if (prefix.length < 2) return formatSlugLabel(groupKey);
  return prefix;
}
