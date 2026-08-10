import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * BrandLogo — renders an official 20FIT lockup from /public/brand.
 *
 *   variant="white" → white wordmark, for dark surfaces (sidebar, login).
 *   variant="color" → black wordmark, for light surfaces (light-theme header).
 *
 * Rules (PRD §18.1): never recolour the wordmark; minimum on-screen width 96px;
 * never place the white lockup on mid-tone glass — it needs a genuinely dark
 * backdrop so the dark ring around the counter-dot disappears cleanly.
 *
 * NOTE: the files in /public/brand are generated PLACEHOLDERS. Drop the official
 * design exports over them (same filenames) and update INTRINSIC if the aspect
 * ratio differs. See public/brand/README.md.
 */
const SRC = {
  white: "/brand/20fit-logo-white.png",
  color: "/brand/20fit-logo-color.png",
} as const;

const INTRINSIC = { width: 840, height: 264 } as const;

export function BrandLogo({
  variant = "color",
  height = 32,
  priority = false,
  className,
}: {
  variant?: keyof typeof SRC;
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  const width = Math.round((INTRINSIC.width / INTRINSIC.height) * height);
  return (
    <Image
      src={SRC[variant]}
      alt="20FIT"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={cn("select-none", className)}
      style={{ height, width }}
    />
  );
}
