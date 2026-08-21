"use client";

import { formatCount } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export interface BarItem {
  /** Row label — a stored data value (unit / product name), shown verbatim in mono. */
  label: string;
  value: number;
}

/**
 * Horizontal bar list (Dashboard Visual sprint). CSS-only — no chart library, no numbered colour
 * classes (K-11); the fill uses a design token and an inline width %. The NUMBER is always written
 * next to its bar, so a bar that rounds to a sliver still reports its real value (the 67,828-vs-2
 * problem). When `scale="sqrt"` the bar length is NOT proportional to the value — the caller must
 * say so on screen (passed as `scaleNote` by the section).
 */
export function BarList({
  items,
  lang,
  scale = "linear",
  barClass = "bg-blue",
}: {
  items: BarItem[];
  lang: Lang;
  scale?: "linear" | "sqrt";
  barClass?: string;
}) {
  const max = items.reduce((m, it) => Math.max(m, it.value), 0);
  const width = (v: number): number => {
    if (max <= 0) return 0;
    const raw = scale === "sqrt" ? Math.sqrt(v) / Math.sqrt(max) : v / max;
    // Give any positive value at least a visible sliver so a small unit never disappears.
    return v > 0 ? Math.max(raw * 100, 1.5) : 0;
  };
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3">
          <span className="truncate font-mono text-[12px] text-ink-soft" title={it.label}>{it.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-glass-border" aria-hidden>
            <span className={`block h-full rounded-full ${barClass}`} style={{ width: `${width(it.value)}%` }} />
          </span>
          <span className="text-right font-display text-[14px] font-bold tabular-nums text-ink">
            {formatCount(it.value, lang)}
          </span>
        </li>
      ))}
    </ul>
  );
}
