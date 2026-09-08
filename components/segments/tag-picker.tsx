"use client";

import { groupTags, namespaceLabel, tagValueLabel } from "@/lib/crm/tags";
import type { Lang } from "@/lib/i18n";

/**
 * Namespace-grouped tag checkboxes (TUGAS D). REUSES the existing tag labels — namespaceLabel /
 * tagValueLabel / groupTags, guarded by tags.parity.test.ts — so there is no second label list to
 * drift (the owner's explicit constraint). Pure presentational: the parent owns which array
 * (tagsAny / tagsAll / exclude.tagsAny) each toggle writes to.
 */
export function TagCheckboxGroups({
  available,
  selected,
  onToggle,
  lang,
}: {
  available: string[];
  selected: readonly string[];
  onToggle: (tag: string) => void;
  lang: Lang;
}) {
  const groups = groupTags(available).operator;
  const chosen = new Set(selected);
  if (groups.length === 0) return null;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.namespace}>
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {namespaceLabel(g.namespace, lang)}
          </p>
          <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {g.tags.map((tag) => (
              <label key={tag} className="flex items-center gap-2 font-body text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={chosen.has(tag)}
                  onChange={() => onToggle(tag)}
                  className="h-4 w-4 accent-red"
                />
                {tagValueLabel(tag, lang)}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
