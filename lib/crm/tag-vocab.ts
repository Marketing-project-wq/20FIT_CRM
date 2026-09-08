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
  const tags = new Set<string>();
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
      for (const t of row.tags ?? []) if (isOperatorTag(t)) tags.add(t);
    }
    if (data.length < PAGE) break;
  }
  return Array.from(tags).sort();
}
