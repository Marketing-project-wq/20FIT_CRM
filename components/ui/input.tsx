import * as React from "react";
import { cn } from "@/lib/utils";

/** Input — radius-sm, glass fill, red focus ring (PRD §18.4/§18.5). */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-sm border border-glass-border bg-glass px-3 py-2 font-body text-[14px] text-ink transition-colors",
        "placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red focus-visible:border-transparent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
