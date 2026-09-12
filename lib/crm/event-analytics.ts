import "server-only";

/**
 * Event analytics — all computations for the "Analisa Event" page.
 *
 * Data source: master_customer.tags[] (every "event:xxx" tag) + crm_tag_registry (labels).
 * Runs server-side via the service-role admin client, returning a plain object the page can
 * pass to a client component without serialization issues.
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

export async function fetchEventAnalytics(admin: AdminClient): Promise<EventAnalyticsData> {
  // 1. Fetch all people who have at least one event: tag, with their event tags
  const { data: rows, error } = await admin
    .from("master_customer")
    .select("customer_id, tags") as { data: { customer_id: string; tags: string[] }[] | null; error: unknown };

  if (error) throw new Error("Failed to fetch master_customer");

  // 2. Fetch tag registry labels for event: namespace
  const { data: registryRows, error: regErr } = await admin
    .from("crm_tag_registry")
    .select("slug, label")
    .eq("namespace", "event") as unknown as { data: { slug: string; label: string | null }[] | null; error: unknown };

  if (regErr) throw new Error("Failed to fetch crm_tag_registry");

  const labelMap = new Map<string, string>();
  for (const r of registryRows ?? []) {
    labelMap.set(r.slug, r.label ?? formatSlugLabel(r.slug));
  }

  // 3. Build per-person event sets
  type PersonEvents = string[];
  const peopleEvents: PersonEvents[] = [];
  const allEventSlugs = new Set<string>();

  for (const row of rows ?? []) {
    if (!row.tags) continue;
    const events = row.tags.filter((t: string) => t.startsWith("event:"));
    if (events.length === 0) continue;
    peopleEvents.push(events);
    for (const e of events) allEventSlugs.add(e);
  }

  // Sort events by slug (chronological proxy — event tags are usually named with date info)
  const sortedEvents = Array.from(allEventSlugs).sort();

  // 4. Compute per-event stats
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

  // 5. KPIs
  const totalPeople = totalPeopleSet.size;
  let returningPeople = 0;
  let allEventsPeople = 0;

  for (const events of peopleEvents) {
    const unique = new Set(events);
    if (unique.size >= 2) returningPeople++;
    if (unique.size >= sortedEvents.length && sortedEvents.length > 0) allEventsPeople++;
  }

  const returningPct = totalPeople > 0 ? Math.round((returningPeople / totalPeople) * 1000) / 10 : 0;

  // 6. Cohort retention matrix
  const cohortMap = new Map<string, number[][]>();
  // cohortMap[firstEvent] = array of personEventIndices arrays

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

  // 7. Churn
  const churn: ChurnRow[] = [];
  let skipAfterOneReturn = 0;

  for (const slug of sortedEvents) {
    const idx = eventIndex.get(slug)!;
    if (idx >= sortedEvents.length - 1) continue; // last event — no "after" to churn to

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

  // Count people who skipped one event but came back later
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

function formatSlugLabel(slug: string): string {
  const value = slug.includes(":") ? slug.slice(slug.indexOf(":") + 1) : slug;
  return value
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
