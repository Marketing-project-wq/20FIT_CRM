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
 * The two lockups have different aspect ratios, so each carries its own intrinsic
 * size and the display width is derived from `height`. If a re-export changes an
 * asset's dimensions, update the matching entry below. See public/brand/README.md.
 */
const ASSETS = {
  white: { src: "/brand/20fit-logo-white.png", width: 2405, height: 677 },
  color: { src: "/brand/20fit-logo-color.png", width: 285, height: 73 },
} as const;

export function BrandLogo({
  variant = "color",
  height = 32,
  priority = false,
  className,
}: {
  variant?: keyof typeof ASSETS;
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  const asset = ASSETS[variant];
  const width = Math.round((asset.width / asset.height) * height);
  return (
    <Image
      src={asset.src}
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
