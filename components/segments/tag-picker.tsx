"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  groupTags,
  namespaceLabel,
  tagValueLabel,
  disambiguateTagLabel,
  ambiguousTagValueLabels,
} from "@/lib/crm/tags";
import type { TagCountEntry } from "@/lib/crm/tag-vocab";
import { formatCount } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * The tag filter (TUGAS D redesign): ONE list, folded, searchable, with a people-count on every value
 * and selected tags as include/exclude chips. Reuses namespaceLabel/tagValueLabel — no second label
 * list. The parent owns the criteria arrays; this only calls the setters.
 *
 *  - T1: every value shows its people-count; namespaces are sorted by the parent (counts desc).
 *  - T2: a selected tag is a CHIP with an include⇄exclude switch — one list, two states — instead of
 *        a second full duplicate list for exclusions.
 *  - T3: namespaces are FOLDED by default (header shows value-count + how many are selected); a search
 *        box filters across all namespaces; a namespace auto-opens when it has a selection or matches.
 */

export interface TagFilterWords {
  searchPlaceholder: string;
  chipsHeading: string;
  include: string;
  exclude: string;
  remove: string;
  anyMode: string;
  allMode: string;
  modeHint: string;
  selectedOfValues: string; // "{sel} dipilih · {n} nilai" — {sel}/{n} substituted
  noMatch: string;
}

function nsOf(tag: string): string {
  return tag.slice(0, tag.indexOf(":"));
}

export function TagFilter({
  entries,
  included,
  excluded,
  mode,
  onSetIncluded,
  onSetExcluded,
  onModeChange,
  lang,
  w,
}: {
  entries: TagCountEntry[];
  included: string[];
  excluded: string[];
  mode: "any" | "all";
  onSetIncluded: (next: string[]) => void;
  onSetExcluded: (next: string[]) => void;
  onModeChange: (mode: "any" | "all") => void;
  lang: Lang;
  w: TagFilterWords;
}) {
  const [query, setQuery] = useState("");
  const [openNs, setOpenNs] = useState<Set<string>>(new Set());

  const countByTag = useMemo(() => new Map(entries.map((e) => [e.tag, e.people])), [entries]);
  const allTags = useMemo(() => entries.map((e) => e.tag), [entries]);
  const ambiguous = useMemo(() => ambiguousTagValueLabels(allTags, lang), [allTags, lang]);
  // Namespaces in canonical order; values within each sorted by people desc (T1: most useful first).
  const groups = useMemo(
    () =>
      groupTags(allTags).operator.map((g) => ({
        namespace: g.namespace,
        tags: [...g.tags].sort((a, b) => (countByTag.get(b) ?? 0) - (countByTag.get(a) ?? 0)),
      })),
    [allTags, countByTag],
  );

  const incl = new Set(included);
  const excl = new Set(excluded);
  const q = query.trim().toLowerCase();
  const matches = (tag: string) =>
    q === "" ||
    tagValueLabel(tag, lang).toLowerCase().includes(q) ||
    tag.toLowerCase().includes(q) ||
    namespaceLabel(nsOf(tag), lang).toLowerCase().includes(q);

  function toggleValue(tag: string) {
    if (incl.has(tag)) onSetIncluded(included.filter((t) => t !== tag));
    else if (excl.has(tag)) onSetExcluded(excluded.filter((t) => t !== tag));
    else onSetIncluded([...included, tag]); // a fresh pick defaults to INCLUDE; flip on the chip
  }
  function chipFlip(tag: string) {
    if (incl.has(tag)) {
      onSetIncluded(included.filter((t) => t !== tag));
      onSetExcluded([...excluded, tag]);
    } else {
      onSetExcluded(excluded.filter((t) => t !== tag));
      onSetIncluded([...included, tag]);
    }
  }
  function chipRemove(tag: string) {
    if (incl.has(tag)) onSetIncluded(included.filter((t) => t !== tag));
    if (excl.has(tag)) onSetExcluded(excluded.filter((t) => t !== tag));
  }

  const selectedTags = [...included, ...excluded];

  return (
    <div className="space-y-3">
      {/* Selected tags as chips (T2) — one list, each an include⇄exclude switch. */}
      {selectedTags.length > 0 && (
        <div>
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{w.chipsHeading}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selectedTags.map((tag) => {
              const isExcl = excl.has(tag);
              return (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-body text-[12px] ${
                    isExcl ? "border-red tint-red text-ink" : "border-glass-border bg-glass text-ink"
                  }`}
                >
                  <span>{disambiguateTagLabel(tag, lang, ambiguous)}</span>
                  <button
                    type="button"
                    onClick={() => chipFlip(tag)}
                    title={isExcl ? w.exclude : w.include}
                    className="rounded-sm px-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-soft hover:text-ink"
                  >
                    {isExcl ? `− ${w.exclude}` : `+ ${w.include}`}
                  </button>
                  <button type="button" onClick={() => chipRemove(tag)} aria-label={w.remove} className="text-ink-faint hover:text-red">
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              );
            })}
          </div>
          {included.length > 0 && (
            <div className="mt-2 flex items-center gap-3 font-body text-[12px] text-ink-soft">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="tagmode" checked={mode === "any"} onChange={() => onModeChange("any")} className="accent-red" />
                {w.anyMode}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="tagmode" checked={mode === "all"} onChange={() => onModeChange("all")} className="accent-red" />
                {w.allMode}
              </label>
              <span className="text-ink-faint">{w.modeHint}</span>
            </div>
          )}
        </div>
      )}

      {/* Search across all namespaces (T3). */}
      <div className="flex items-center gap-2 rounded-sm border border-glass-border bg-glass px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={w.searchPlaceholder}
          className="h-8 w-full bg-transparent font-body text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label={w.remove} className="text-ink-faint hover:text-ink">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Folded namespaces (T3). Open when clicked, when searching, or when it holds a selection. */}
      <div className="space-y-1.5">
        {groups.map((g) => {
          const visibleTags = g.tags.filter(matches);
          if (q !== "" && visibleTags.length === 0) return null; // hide non-matching namespaces while searching
          const selectedCount = g.tags.filter((t) => incl.has(t) || excl.has(t)).length;
          const open = openNs.has(g.namespace) || q !== "" || selectedCount > 0;
          return (
            <div key={g.namespace} className="rounded-sm border border-glass-border">
              <button
                type="button"
                onClick={() =>
                  setOpenNs((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.namespace)) next.delete(g.namespace);
                    else next.add(g.namespace);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="flex items-center gap-1.5">
                  {open ? <ChevronDown className="h-3.5 w-3.5 text-ink-faint" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />}
                  <span className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">{namespaceLabel(g.namespace, lang)}</span>
                </span>
                <span className="font-body text-[11px] text-ink-faint">
                  {w.selectedOfValues.replace("{sel}", String(selectedCount)).replace("{n}", String(g.tags.length))}
                </span>
              </button>
              {open && (
                <div className="grid grid-cols-1 gap-1 px-3 pb-2.5 sm:grid-cols-2">
                  {visibleTags.map((tag) => {
                    const state = incl.has(tag) ? "in" : excl.has(tag) ? "ex" : "off";
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleValue(tag)}
                        className={`flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left font-body text-[13px] ${
                          state === "in" ? "tint-red text-ink" : state === "ex" ? "tint-red text-ink line-through" : "text-ink hover:bg-glass"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-sm border ${state !== "off" ? "border-red bg-red" : "border-glass-border"}`} aria-hidden />
                          <span className="truncate">{tagValueLabel(tag, lang)}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-faint">{formatCount(countByTag.get(tag) ?? 0, lang)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {groups.length > 0 && groups.every((g) => g.tags.filter(matches).length === 0) && (
          <p className="px-1 font-body text-[12px] text-ink-faint">{w.noMatch}</p>
        )}
      </div>
    </div>
  );
}
