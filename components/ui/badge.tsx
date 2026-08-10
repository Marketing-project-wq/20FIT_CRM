import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status tag / meta pill (PRD §18.5, §18.6). Pill shape, Barlow Condensed
 * uppercase, tinted background. Exactly four status tones + neutral — the CRM's
 * many states are folded onto these; the palette is never expanded.
 *
 *   red    → stop / compliance risk (suppressed, consent withdrawn, blocked, bounce)
 *   blue   → work in flight (running, queued, resolving, importing)
 *   amber  → blocked on a human / external party (awaiting approval, unverified)
 *   green  → confirmed success only (granted, delivered, completed, approved)
 *   neutral→ absence (not applicable, never engaged, field empty)
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-display text-[12px] font-bold uppercase leading-normal tracking-wide",
  {
    variants: {
      tone: {
        red: "tint-red",
        blue: "tint-blue",
        amber: "tint-amber",
        green: "tint-green",
        neutral: "tint-neutral",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
