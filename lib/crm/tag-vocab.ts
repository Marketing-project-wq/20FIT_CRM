import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOperatorTag } from "./tags";

/**
 * The DISTINCT operator tags actually present in master_customer.tags — the segmentation vocabulary
 * (TUGAS D). Used two ways: the segment builder's tag picker (what the operator can choose) and the AI
 * assistant's prompt + validator (what it may map an event/role name to, and NOTHING else — an event
 * not in this list is refused, never invented).
 *
 * WHY read the rows, not a distinct-RPC: adding an RPC is a gated migration, and the whole point of
 * TUGAS D (measured) is that no migration is needed — master_customer.tags is already there and
 * GIN-indexed. Only ~3.781 rows carry any tag (`tags <> '{}'`), so paging those and de-duplicating in
 * memory is cheap (measured: 28 distinct operator tags today). Chunked page reads capture `error` and
 * throw — a failed read must never masquerade as "no tags" (T-69).
 */

const PAGE = 1000;
const MAX_PAGES = 50; // 50k tagged rows is far above today's 3.781 — a guard, never expected to bind

export async function fetchPoolTagVocab(admin: SupabaseClient): Promise<string[]> {
  return (await fetchPoolTagCounts(admin)).entries.map((e) => e.tag);
}

export interface TagCountEntry {
  tag: string;
  /** How many people in master_customer carry this tag. */
  people: number;
}

export interface TagVocabCounts {
  entries: TagCountEntry[];
  /** DISTINCT people per namespace — a person with two `event:` tags counts ONCE (summing per-tag
   *  counts would overcount). This is what the folded namespace header shows ("Acara · 3.625 orang"). */
  namespacePeople: Record<string, number>;
}

/**
 * Distinct operator tags with their people-counts (TUGAS 1), computed ONCE from the ~3.781 tagged rows
 * — the segment builder shows a number beside every tag so an operator isn't choosing blind among 40
 * boxes. A single DB aggregate (`unnest + group by`) is ~92 ms warm but needs a full scan (the GIN
 * index can't serve a group-by-all-tags), so we tally in memory over the same rows this read already
 * pages — no per-tag query, no migration. Fail-loud on a read error (never a half count). Sorted by
 * people desc so callers get "most useful first" for free.
 */
export async function fetchPoolTagCounts(admin: SupabaseClient): Promise<TagVocabCounts> {
  const counts = new Map<string, number>();
  const nsPeople = new Map<string, number>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await admin
      .from("master_customer")
      .select("tags")
      .neq("tags", "{}") // non-empty only — bounds the read to the ~3.781 tagged rows
      .range(from, from + PAGE - 1);
    if (error) throw error; // fail loud: never return a half/empty vocabulary as if complete
    if (!data || data.length === 0) break;
    for (const row of data as { tags: string[] | null }[]) {
      const rowNamespaces = new Set<string>();
      for (const t of row.tags ?? []) {
        if (!isOperatorTag(t)) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
        rowNamespaces.add(t.slice(0, t.indexOf(":")));
      }
      // DISTINCT people per namespace: count this row ONCE per namespace it carries any tag in.
      rowNamespaces.forEach((ns) => nsPeople.set(ns, (nsPeople.get(ns) ?? 0) + 1));
    }
    if (data.length < PAGE) break;
  }
  const entries = Array.from(counts, ([tag, people]) => ({ tag, people })).sort(
    (a, b) => b.people - a.people || a.tag.localeCompare(b.tag),
  );
  const namespacePeople: Record<string, number> = {};
  nsPeople.forEach((v, k) => { namespacePeople[k] = v; });
  return { entries, namespacePeople };
}
