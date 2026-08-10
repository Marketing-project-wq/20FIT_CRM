import * as React from "react";
import { cn } from "@/lib/utils";

/** Field label — Barlow Condensed 700 uppercase, small (matches the "label" role). */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "font-display text-[13px] font-bold uppercase tracking-wide text-ink-soft",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
