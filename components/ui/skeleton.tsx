import { cn } from "@/lib/utils";

/**
 * Loading skeleton (Dashboard progressive-load sprint). A pulsing filled block that is SHAPED like
 * the content it stands in for — a number-sized bar for a KPI numeral, a row for a chart bar. It
 * means ONE thing: "this is being computed."
 *
 * It must never be mistaken for `—` (K-08: "no source"). A pulsing solid rectangle reads nothing
 * like a static em-dash glyph, which is the whole point: a reader can tell "still counting" from
 * "nothing to count" at a glance. `bg-glass-border` is a flat token (no numbered/opacity class,
 * K-11); `role="status"` + `aria-label` announce it to assistive tech.
 */
export function Skeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      aria-busy="true"
      className={cn("block animate-pulse rounded-sm bg-glass-border", className)}
    />
  );
}
