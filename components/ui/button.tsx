import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — Barlow Condensed 700 uppercase, radius-sm (PRD §18.5).
 *   primary   → the single main action per screen (BUAT / create / send). Red fill.
 *   secondary → neutral glass fill (BATAL / back / secondary export).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-display font-bold uppercase tracking-wide transition-[opacity,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-red text-white shadow-glass hover:opacity-90",
        secondary: "glass text-ink hover:bg-glass-strong",
        outline: "border border-glass-border bg-transparent text-ink hover:bg-glass",
        ghost: "text-ink-soft hover:bg-glass hover:text-ink",
        link: "text-red underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
