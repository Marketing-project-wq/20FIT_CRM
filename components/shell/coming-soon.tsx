import { Badge } from "@/components/ui/badge";

/** Placeholder for nav destinations not built in Sprint 1. */
export function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: string;
}) {
  return (
    <div>
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{title}</h1>

      <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
        <Badge tone="blue">Segera hadir</Badge>
        <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{description}</p>
        {phase && <p className="font-mono text-[11px] text-ink-faint">{phase}</p>}
      </div>
    </div>
  );
}
