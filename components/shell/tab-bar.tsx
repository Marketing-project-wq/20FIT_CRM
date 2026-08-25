"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabDef {
  key: string;
  label: string;
  href: string; // full href incl. ?tab=… so a tab is linkable/bookmarkable
}

/**
 * Shared tab bar for the consolidated screens (Audience, Templates) — Sprint nav-rebuild. Query-param
 * tabs (?tab=…), so each tab is a real URL (bookmarkable, back-button works) and there is ONE host
 * route, not a scatter of sub-routes that would collide with /audience/[id]. Responsive (BAGIAN D):
 * the row scrolls sideways on a narrow screen instead of wrapping into a mis-tappable pile, and each
 * tab is a large touch target.
 */
export function TabBar({ tabs, active }: { tabs: TabDef[]; active: string }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <div role="tablist" className="flex min-w-max gap-1 border-b border-glass-border px-1">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "shrink-0 rounded-t-sm px-4 py-2.5 font-display text-[13px] font-bold uppercase tracking-wide transition-colors",
                "min-h-[44px] flex items-center", // touch target
                isActive
                  ? "border-b-2 border-red text-ink"
                  : "border-b-2 border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
