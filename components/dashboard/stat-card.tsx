import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard KPI card (Shop-inventory redesign, K-46): a SOLID card (.card) with NO left accent
 * rule, a small muted icon top-right, and a lighter (semibold) numeral. The three numeral states
 * are unchanged — the redesign is display-only, K-08 stands:
 *   - `loading` → a pulsing block SHAPED like the numeral ("being computed"), never `—`.
 *   - `errorLabel` → a short red note ("this figure failed"), not a spinner that hangs.
 *   - otherwise the `value` string — which may itself be `—` (K-08: "no source"), a REAL value
 *     that stays visibly different from the loading block above.
 */
export function StatCard({
  label,
  value = "—",
  hint,
  className,
  loading = false,
  errorLabel,
  computingLabel,
  icon,
}: {
  label: string;
  value?: string;
  hint?: string;
  className?: string;
  loading?: boolean;
  errorLabel?: string;
  computingLabel?: string;
  /** Small decorative glyph shown top-right (lucide icon). Purely cosmetic. */
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("card relative p-5", className)}>
      {icon && <span className="absolute right-4 top-4 text-ink-faint" aria-hidden>{icon}</span>}
      {/* Label is a caption: uppercase + tracking already marks it, so it stays semibold and the
          numeral is the one heavier thing in the card (redesign: lighter numeral weight). */}
      <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      {loading ? (
        // Height matches the numeral line so the card does not resize when the value lands.
        <Skeleton className="mt-2 h-[26px] w-2/3" label={computingLabel} />
      ) : errorLabel ? (
        <p className="mt-2 font-body text-[13px] font-semibold text-red">{errorLabel}</p>
      ) : (
        <p className="mt-2 font-display text-[32px] font-semibold leading-none text-ink">{value}</p>
      )}
      {hint && <p className="mt-2 font-mono text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
