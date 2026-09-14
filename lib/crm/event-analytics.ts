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

export interface DemographicBreakdown {
  gender: { male: number; female: number; unknown: number };
  ageBrackets: { label: string; count: number }[];
  topCities: { city: string; count: number }[];
  otherCities: number;
  total: number;
}

export interface EventDemographic {
  groupKey: string;
  groupLabel: string;
  demographics: DemographicBreakdown;
}

export interface EventComparison {
  eventA: { key: string; label: string; total: number; newCount: number; returning: number; returningPct: number };
  eventB: { key: string; label: string; total: number; newCount: number; returning: number; returningPct: number };
  overlap: number;
  onlyA: number;
  onlyB: number;
  overlapPctA: number;
  overlapPctB: number;
  demographicsA: DemographicBreakdown;
  demographicsB: DemographicBreakdown;
}

export type InsightSentiment = "positive" | "negative" | "neutral";
export type InsightCategory = "growth" | "retention" | "demographic" | "action";

export interface Insight {
  category: InsightCategory;
  icon: string;
  labelKey: string;
  textKey: string;
  replacements: Record<string, string>;
  sentiment: InsightSentiment;
}

export interface LifecycleFunnel {
  stages: { key: "new" | "returning" | "loyal" | "churned"; count: number; pct: number }[];
  conversions: { from: string; to: string; rate: number }[];
}

export interface CategoryGrowthRow {
  groupKey: string;
  groupLabel: string;
  total: number;
  growthPct: number | null;
}

export interface OverlapMatrix {
  groupKeys: string[];
  groupLabels: string[];
  cells: number[][];
  pcts: number[][];
}

export interface GeoCity {
  city: string;
  count: number;
  badge: "new" | "lost" | null;
}

export interface GeoGroupData {
  groupKey: string;
  groupLabel: string;
  topCities: GeoCity[];
  concentrationTop1Pct: number;
  concentrationTop3Pct: number;
  totalWithCity: number;
}

export interface GeoExpansion {
  groups: GeoGroupData[];
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
  demographics: EventDemographic[];
  comparison: EventComparison | null;
  insights: Insight[];
  funnel: LifecycleFunnel;
  categoryGrowth: CategoryGrowthRow[];
  overlapMatrix: OverlapMatrix;
  geoExpansion: GeoExpansion;
}

export interface EventAnalyticsFilter {
  eventSlugs?: string[];
  dateFrom?: string;
  dateTo?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const PAGE = 1000;

export async function fetchEventAnalytics(admin: AdminClient, filter?: EventAnalyticsFilter): Promise<EventAnalyticsData> {
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

  // Source A: master_customer event tags + demographics (paged)
  const tagsByPerson = new Map<string, string[]>();
  const personDemo = new Map<string, { gender: string | null; dob: string | null; city: string | null }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id, tags, gender, date_of_birth, city")
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Failed to fetch master_customer");
    const rows = (data ?? []) as { customer_id: string; tags: string[] | null; gender: string | null; date_of_birth: string | null; city: string | null }[];
    for (const row of rows) {
      if (!row.customer_id) continue;
      if (row.gender || row.date_of_birth || row.city) {
        personDemo.set(row.customer_id, { gender: row.gender, dob: row.date_of_birth, city: row.city });
      }
      if (!row.tags) continue;
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
    let ceQuery = admin
      .from("customer_engagement")
      .select("customer_id, product, first_seen_at")
      .eq("unit", "event");
    if (filter?.dateFrom) ceQuery = ceQuery.gte("first_seen_at", filter.dateFrom);
    if (filter?.dateTo) ceQuery = ceQuery.lte("first_seen_at", filter.dateTo + "T23:59:59");
    const { data, error } = await ceQuery.range(from, from + PAGE - 1);
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
  const filterGroupSet = filter?.eventSlugs?.length
    ? new Set(filter.eventSlugs.map((s) => s.startsWith("event:") ? s : "event:" + s))
    : null;

  const allCustomerIds = new Set<string>();
  tagsByPerson.forEach((_v, id) => allCustomerIds.add(id));
  engagementByPerson.forEach((_v, id) => allCustomerIds.add(id));

  const allEventSlugs = new Set<string>();
  const peopleEvents: string[][] = [];
  const peopleCids: string[] = [];

  Array.from(allCustomerIds).forEach((cid) => {
    const merged = new Set<string>();
    const tagEvents = tagsByPerson.get(cid);
    if (tagEvents) for (const e of tagEvents) merged.add(e);
    const engEvents = engagementByPerson.get(cid);
    if (engEvents) engEvents.forEach((e) => merged.add(e));
    if (merged.size === 0) return;
    let arr = Array.from(merged);
    if (filterGroupSet) {
      arr = arr.filter((e) => filterGroupSet.has(eventGroupKey(e)));
      if (arr.length === 0) return;
    }
    peopleEvents.push(arr);
    peopleCids.push(cid);
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

  // === DEMOGRAPHICS PER GROUP ===
  const demographics: EventDemographic[] = [];
  const today = new Date();

  for (const gk of sortedGroupKeys) {
    const peoplePIs = groupTotals.get(gk)!;
    const demo = computeDemographics(peoplePIs, peopleCids, personDemo, today);
    demographics.push({
      groupKey: gk,
      groupLabel: groupLabelMap.get(gk) ?? formatSlugLabel(gk),
      demographics: demo,
    });
  }

  // === CROSS-EVENT COMPARISON (exactly 2 groups filtered) ===
  let comparison: EventComparison | null = null;

  if (sortedGroupKeys.length === 2) {
    const gkA = sortedGroupKeys[0];
    const gkB = sortedGroupKeys[1];
    const setA = groupTotals.get(gkA)!;
    const setB = groupTotals.get(gkB)!;

    let overlap = 0;
    setA.forEach((pi) => { if (setB.has(pi)) overlap++; });
    const onlyA = setA.size - overlap;
    const onlyB = setB.size - overlap;

    const gA = groups.find((g) => g.groupKey === gkA)!;
    const gB = groups.find((g) => g.groupKey === gkB)!;
    const retPctA = gA.total > 0 ? Math.round((gA.returning / gA.total) * 1000) / 10 : 0;
    const retPctB = gB.total > 0 ? Math.round((gB.returning / gB.total) * 1000) / 10 : 0;

    const demoA = computeDemographics(setA, peopleCids, personDemo, today);
    const demoB = computeDemographics(setB, peopleCids, personDemo, today);

    comparison = {
      eventA: { key: gkA, label: gA.groupLabel, total: gA.total, newCount: gA.newCount, returning: gA.returning, returningPct: retPctA },
      eventB: { key: gkB, label: gB.groupLabel, total: gB.total, newCount: gB.newCount, returning: gB.returning, returningPct: retPctB },
      overlap,
      onlyA,
      onlyB,
      overlapPctA: setA.size > 0 ? Math.round((overlap / setA.size) * 1000) / 10 : 0,
      overlapPctB: setB.size > 0 ? Math.round((overlap / setB.size) * 1000) / 10 : 0,
      demographicsA: demoA,
      demographicsB: demoB,
    };
  }

  const funnel = computeLifecycleFunnel(peopleGroups, sortedGroupKeys, groupIndex);
  const categoryGrowth = computeCategoryGrowth(groups);
  const overlapMatrix = computeOverlapMatrix(sortedGroupKeys, groupTotals, groupLabelMap);
  const geoExpansion = computeGeoExpansion(sortedGroupKeys, groupTotals, peopleCids, personDemo, groupLabelMap);

  const analyticsBase = {
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
    demographics,
    comparison,
    funnel,
    categoryGrowth,
    overlapMatrix,
    geoExpansion,
  };

  return { ...analyticsBase, insights: generateInsights(analyticsBase) };
}

export { eventGroupKey, generateInsights };

function generateInsights(data: Omit<EventAnalyticsData, "insights">): Insight[] {
  const insights: Insight[] = [];
  const MAX_INSIGHTS = 10;

  // --- GROWTH & TREND ---

  if (data.groups.length >= 2) {
    const last = data.groups[data.groups.length - 1];
    const prev = data.groups[data.groups.length - 2];
    if (prev.total > 0) {
      const growthPct = Math.round(((last.total - prev.total) / prev.total) * 1000) / 10;
      if (growthPct > 0) {
        insights.push({
          category: "growth",
          icon: "TrendingUp",
          labelKey: "insightGrowthLabel",
          textKey: "insightGrowthUp",
          replacements: { pct: String(Math.abs(growthPct)), curr: last.groupLabel, prev: prev.groupLabel },
          sentiment: "positive",
        });
      } else if (growthPct < -10) {
        insights.push({
          category: "growth",
          icon: "TrendingDown",
          labelKey: "insightGrowthLabel",
          textKey: "insightGrowthDown",
          replacements: { pct: String(Math.abs(growthPct)), curr: last.groupLabel, prev: prev.groupLabel },
          sentiment: "negative",
        });
      }
    }
  }

  if (data.groups.length >= 1) {
    const best = data.groups.reduce((a, b) => (a.total > b.total ? a : b));
    if (best.total > 0) {
      insights.push({
        category: "growth",
        icon: "Trophy",
        labelKey: "insightGrowthLabel",
        textKey: "insightTopEvent",
        replacements: { label: best.groupLabel, n: String(best.total) },
        sentiment: "neutral",
      });
    }
  }

  // --- RETENTION ---

  if (data.cohort.length >= 2) {
    const first = data.cohort[0];
    const second = data.cohort[1];
    if (first.retention.length > 0 && second.retention.length > 0) {
      const firstRet = first.retention[0];
      const secondRet = second.retention[0];
      if (secondRet < firstRet) {
        insights.push({
          category: "retention",
          icon: "TrendingDown",
          labelKey: "insightRetentionLabel",
          textKey: "insightRetWeakening",
          replacements: { a: first.cohortLabel, pctA: String(firstRet), b: second.cohortLabel, pctB: String(secondRet) },
          sentiment: "negative",
        });
      } else if (secondRet > firstRet) {
        insights.push({
          category: "retention",
          icon: "TrendingUp",
          labelKey: "insightRetentionLabel",
          textKey: "insightRetStrengthening",
          replacements: { pctA: String(firstRet), b: second.cohortLabel, pctB: String(secondRet) },
          sentiment: "positive",
        });
      }
    }
  }

  if (data.churn.length > 0) {
    const worst = data.churn.reduce((a, b) => (a.notReturnedPct > b.notReturnedPct ? a : b));
    if (worst.notReturnedPct > 80) {
      insights.push({
        category: "retention",
        icon: "AlertTriangle",
        labelKey: "insightRetentionLabel",
        textKey: "insightHighChurnNew",
        replacements: { label: worst.label, pct: String(worst.notReturnedPct) },
        sentiment: "negative",
      });
    }
  }

  if (data.returningPct >= 30) {
    insights.push({
      category: "retention",
      icon: "Heart",
      labelKey: "insightRetentionLabel",
      textKey: "insightStrongLoyalty",
      replacements: { pct: String(data.returningPct) },
      sentiment: "positive",
    });
  }

  // --- DEMOGRAPHIC ---

  const allDemo = data.demographics;
  if (allDemo.length > 0) {
    let totalMale = 0, totalFemale = 0, totalDemo = 0;
    for (const d of allDemo) {
      totalMale += d.demographics.gender.male;
      totalFemale += d.demographics.gender.female;
      totalDemo += d.demographics.total;
    }
    if (totalDemo > 0) {
      const malePct = Math.round((totalMale / totalDemo) * 1000) / 10;
      const femalePct = Math.round((totalFemale / totalDemo) * 1000) / 10;
      if (malePct > 70 || femalePct > 70) {
        const dominant = malePct > femalePct ? "male" : "female";
        const domPct = dominant === "male" ? malePct : femalePct;
        insights.push({
          category: "demographic",
          icon: "Users",
          labelKey: "insightDemographicLabel",
          textKey: "insightGenderSkew",
          replacements: { gender: dominant, pct: String(domPct) },
          sentiment: "neutral",
        });
      }
    }

    const ageTotals = new Map<string, number>();
    for (const d of allDemo) {
      for (const ab of d.demographics.ageBrackets) {
        if (ab.label === "Unknown") continue;
        ageTotals.set(ab.label, (ageTotals.get(ab.label) ?? 0) + ab.count);
      }
    }
    if (ageTotals.size > 0) {
      let topBracket = "";
      let topCount = 0;
      ageTotals.forEach((count, label) => {
        if (count > topCount) { topCount = count; topBracket = label; }
      });
      if (topBracket && totalDemo > 0) {
        const bracketPct = Math.round((topCount / totalDemo) * 1000) / 10;
        insights.push({
          category: "demographic",
          icon: "BarChart3",
          labelKey: "insightDemographicLabel",
          textKey: "insightTopAge",
          replacements: { bracket: topBracket, pct: String(bracketPct) },
          sentiment: "neutral",
        });
      }
    }
  }

  // --- ACTIONABLE RECOMMENDATIONS ---

  if (data.returningPct < 15 && data.totalPeople > 0) {
    insights.push({
      category: "action",
      icon: "Lightbulb",
      labelKey: "insightActionLabel",
      textKey: "insightRecLowReturn",
      replacements: { pct: String(data.returningPct) },
      sentiment: "negative",
    });
  }

  if (data.skipAfterOneReturn > 0) {
    insights.push({
      category: "action",
      icon: "Target",
      labelKey: "insightActionLabel",
      textKey: "insightRecSkipReturn",
      replacements: { n: String(data.skipAfterOneReturn) },
      sentiment: "positive",
    });
  }

  if (data.churn.length > 0) {
    const worstChurn = data.churn.reduce((a, b) => (a.notReturnedPct > b.notReturnedPct ? a : b));
    if (worstChurn.notReturnedPct > 50) {
      insights.push({
        category: "action",
        icon: "MessageCircle",
        labelKey: "insightActionLabel",
        textKey: "insightRecSurvey",
        replacements: { label: worstChurn.label, pct: String(worstChurn.notReturnedPct) },
        sentiment: "negative",
      });
    }
  }

  return insights.slice(0, MAX_INSIGHTS);
}

function computeLifecycleFunnel(
  peopleGroups: string[][],
  sortedGroupKeys: string[],
  groupIndex: Map<string, number>,
): LifecycleFunnel {
  const total = peopleGroups.length;
  if (total === 0) return { stages: [], conversions: [] };

  const lastIdx = sortedGroupKeys.length - 1;
  let newCount = 0;
  let returningCount = 0;
  let loyalCount = 0;
  let churnedCount = 0;

  for (const pg of peopleGroups) {
    const unique = new Set(pg);
    const maxIdx = Math.max(...Array.from(unique).map((g) => groupIndex.get(g) ?? 0));

    if (unique.size === 1) newCount++;
    else if (unique.size === 2) returningCount++;
    else loyalCount++;

    if (maxIdx < lastIdx) churnedCount++;
  }

  const stages: LifecycleFunnel["stages"] = [
    { key: "new", count: newCount, pct: total > 0 ? Math.round((newCount / total) * 1000) / 10 : 0 },
    { key: "returning", count: returningCount, pct: total > 0 ? Math.round((returningCount / total) * 1000) / 10 : 0 },
    { key: "loyal", count: loyalCount, pct: total > 0 ? Math.round((loyalCount / total) * 1000) / 10 : 0 },
    { key: "churned", count: churnedCount, pct: total > 0 ? Math.round((churnedCount / total) * 1000) / 10 : 0 },
  ];

  const returningPlus = returningCount + loyalCount;
  const conversions: LifecycleFunnel["conversions"] = [
    { from: "new", to: "returning", rate: total > 0 ? Math.round((returningPlus / total) * 1000) / 10 : 0 },
    { from: "returning", to: "loyal", rate: returningPlus > 0 ? Math.round((loyalCount / returningPlus) * 1000) / 10 : 0 },
  ];

  return { stages, conversions };
}

function computeCategoryGrowth(groups: EventGroup[]): CategoryGrowthRow[] {
  return groups.map((g, i) => ({
    groupKey: g.groupKey,
    groupLabel: g.groupLabel,
    total: g.total,
    growthPct: i > 0 && groups[i - 1].total > 0
      ? Math.round(((g.total - groups[i - 1].total) / groups[i - 1].total) * 1000) / 10
      : null,
  }));
}

function computeOverlapMatrix(
  sortedGroupKeys: string[],
  groupTotals: Map<string, Set<number>>,
  groupLabelMap: Map<string, string>,
): OverlapMatrix {
  const n = sortedGroupKeys.length;
  const cells: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const pcts: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    const setI = groupTotals.get(sortedGroupKeys[i])!;
    cells[i][i] = setI.size;
    pcts[i][i] = 100;
    for (let j = i + 1; j < n; j++) {
      const setJ = groupTotals.get(sortedGroupKeys[j])!;
      let overlap = 0;
      setI.forEach((pi) => { if (setJ.has(pi)) overlap++; });
      cells[i][j] = overlap;
      cells[j][i] = overlap;
      pcts[i][j] = setI.size > 0 ? Math.round((overlap / setI.size) * 1000) / 10 : 0;
      pcts[j][i] = setJ.size > 0 ? Math.round((overlap / setJ.size) * 1000) / 10 : 0;
    }
  }

  return {
    groupKeys: sortedGroupKeys,
    groupLabels: sortedGroupKeys.map((k) => groupLabelMap.get(k) ?? formatSlugLabel(k)),
    cells,
    pcts,
  };
}

function computeGeoExpansion(
  sortedGroupKeys: string[],
  groupTotals: Map<string, Set<number>>,
  peopleCids: string[],
  personDemo: Map<string, { gender: string | null; dob: string | null; city: string | null }>,
  groupLabelMap: Map<string, string>,
): GeoExpansion {
  const prevCityMaps: Map<string, number>[] = [];
  const result: GeoGroupData[] = [];

  for (let gi = 0; gi < sortedGroupKeys.length; gi++) {
    const gk = sortedGroupKeys[gi];
    const people = groupTotals.get(gk)!;
    const cityCounts = new Map<string, number>();
    const citySet = new Set<string>();

    people.forEach((pi) => {
      const cid = peopleCids[pi];
      const d = cid ? personDemo.get(cid) : undefined;
      if (d?.city) {
        const c = d.city.trim();
        if (c) {
          cityCounts.set(c, (cityCounts.get(c) ?? 0) + 1);
          citySet.add(c);
        }
      }
    });

    const totalWithCity = Array.from(cityCounts.values()).reduce((s, v) => s + v, 0);
    const sorted = Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]);
    const top10 = sorted.slice(0, 10);

    const prevCitySet = gi > 0 ? new Set(prevCityMaps[gi - 1].keys()) : null;
    const topCities: GeoCity[] = top10.map(([city, count]) => ({
      city,
      count,
      badge: prevCitySet ? (prevCitySet.has(city) ? null : "new") : null,
    }));

    if (prevCitySet && gi > 0) {
      const prevSorted = Array.from(prevCityMaps[gi - 1].entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [city] of prevSorted) {
        if (!citySet.has(city)) {
          topCities.push({ city, count: 0, badge: "lost" });
        }
      }
    }

    prevCityMaps.push(cityCounts);

    const top1Count = sorted.length > 0 ? sorted[0][1] : 0;
    const top3Count = sorted.slice(0, 3).reduce((s, [, c]) => s + c, 0);

    result.push({
      groupKey: gk,
      groupLabel: groupLabelMap.get(gk) ?? formatSlugLabel(gk),
      topCities,
      concentrationTop1Pct: totalWithCity > 0 ? Math.round((top1Count / totalWithCity) * 1000) / 10 : 0,
      concentrationTop3Pct: totalWithCity > 0 ? Math.round((top3Count / totalWithCity) * 1000) / 10 : 0,
      totalWithCity,
    });
  }

  return { groups: result };
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

const EVENT_ALIASES: Record<string, string> = {
  "sportfest-v-02": "sportfest-2",
  "platarox-racelab": "platarox-2026-07",
};

function eventGroupKey(slug: string): string {
  const value = slug.startsWith("event:") ? slug.slice(6) : slug;
  let key = value;
  key = key.replace(/-(2\.7k|5k|10k|21k|hm)$/i, "");
  key = key.replace(/-(half|single|doubles?|relay)$/i, "");
  key = key.replace(/-(fri|sat|sun|mon|tue|wed|thu)(-[a-z0-9]+)*$/i, "");
  if (EVENT_ALIASES[key]) key = EVENT_ALIASES[key];
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

const AGE_BRACKETS: { label: string; min: number; max: number }[] = [
  { label: "<18", min: 0, max: 17 },
  { label: "18-24", min: 18, max: 24 },
  { label: "25-34", min: 25, max: 34 },
  { label: "35-44", min: 35, max: 44 },
  { label: "45-54", min: 45, max: 54 },
  { label: "55+", min: 55, max: 999 },
];

function computeAge(dob: string, today: Date): number {
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function computeDemographics(
  peoplePIs: Set<number>,
  peopleCids: string[],
  personDemo: Map<string, { gender: string | null; dob: string | null; city: string | null }>,
  today: Date,
): DemographicBreakdown {
  let male = 0, female = 0, gUnknown = 0;
  const ageCounts = new Array(AGE_BRACKETS.length).fill(0);
  let ageUnknown = 0;
  const cityCounts = new Map<string, number>();

  peoplePIs.forEach((pi) => {
    const cid = peopleCids[pi];
    const d = cid ? personDemo.get(cid) : undefined;

    if (d?.gender === "L") male++;
    else if (d?.gender === "P") female++;
    else gUnknown++;

    if (d?.dob) {
      const age = computeAge(d.dob, today);
      let placed = false;
      for (let i = 0; i < AGE_BRACKETS.length; i++) {
        if (age >= AGE_BRACKETS[i].min && age <= AGE_BRACKETS[i].max) {
          ageCounts[i]++;
          placed = true;
          break;
        }
      }
      if (!placed) ageUnknown++;
    } else {
      ageUnknown++;
    }

    if (d?.city) {
      const c = d.city.trim();
      if (c) cityCounts.set(c, (cityCounts.get(c) ?? 0) + 1);
    }
  });

  const sortedCities = Array.from(cityCounts.entries())
    .sort((a, b) => b[1] - a[1]);
  const top10 = sortedCities.slice(0, 10).map(([city, count]) => ({ city, count }));
  const otherCities = sortedCities.slice(10).reduce((sum, [, c]) => sum + c, 0);

  return {
    gender: { male, female, unknown: gUnknown },
    ageBrackets: [
      ...AGE_BRACKETS.map((b, i) => ({ label: b.label, count: ageCounts[i] })),
      { label: "Unknown", count: ageUnknown },
    ],
    topCities: top10,
    otherCities,
    total: peoplePIs.size,
  };
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
