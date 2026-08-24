import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard KPI card (PRD §18.5): red left rule, Barlow 900 numeral, mono sub-label.
 *
 * THREE distinct states for the numeral, never conflated (Progressive-load sprint + K-08):
 *   - `loading` → a pulsing block SHAPED like the numeral ("being computed").
 *   - `errorLabel` → a short red note ("this figure failed") — a dead end announced, not a
 *     spinner that hangs forever.
 *   - otherwise the `value` string — which may itself be `—` (K-08: "no source"), a REAL value
 *     that must stay visibly different from the loading block above.
 */
export function StatCard({
  label,
  value = "—",
  hint,
  className,
  loading = false,
  errorLabel,
  computingLabel,
}: {
  label: string;
  value?: string;
  hint?: string;
  className?: string;
  loading?: boolean;
  errorLabel?: string;
  computingLabel?: string;
}) {
  return (
    <div className={cn("glass shadow-glass relative overflow-hidden p-5", className)}>
      <span className="absolute left-0 top-0 h-full w-1 bg-red" aria-hidden />
      {/* Label is a caption: uppercase + tracking already marks it, so it stays semibold and the
          numeral is the one bold thing in the card (4B display cleanup). */}
      <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      {loading ? (
        // Height matches the 34px numeral line so the card does not resize when the value lands.
        <Skeleton className="mt-2 h-[26px] w-2/3" label={computingLabel} />
      ) : errorLabel ? (
        <p className="mt-2 font-body text-[13px] font-semibold text-red">{errorLabel}</p>
      ) : (
        <p className="mt-2 font-display text-[34px] font-black leading-none text-ink">{value}</p>
      )}
      {hint && <p className="mt-2 font-mono text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
