import { cn } from "@/lib/utils";

/**
 * Dashboard KPI card (PRD §18.5): red left rule, Barlow 900 numeral, mono
 * sub-label. Value defaults to the em-dash placeholder — no customer table is
 * queried in Sprint 1.
 */
export function StatCard({
  label,
  value = "—",
  hint,
  className,
}: {
  label: string;
  value?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("glass shadow-glass relative overflow-hidden p-5", className)}>
      <span className="absolute left-0 top-0 h-full w-1 bg-red" aria-hidden />
      <p className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-[34px] font-black leading-none text-ink">{value}</p>
      {hint && <p className="mt-2 font-mono text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
