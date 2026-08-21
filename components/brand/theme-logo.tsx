import { BrandLogo } from "./logo";

/**
 * Theme-aware 20FIT lockup for the auth pages: the WHITE wordmark on the dark theme, the COLOUR
 * wordmark on the light theme.
 *
 * WHY BOTH ARE RENDERED: the white lockup's dark ring around the counter-dot vanishes on a light
 * background (PRD §18.1), so the variant MUST follow the theme. The theme toggle flips
 * `<html data-theme>` WITHOUT a reload, so a server-computed variant would go stale until refresh.
 * Rendering both and letting CSS (`app/globals.css` → `.logo-dark-only` / `.logo-light-only`) hide
 * the wrong one keys off the ancestor `data-theme`, so it flips instantly, no JS, no flash.
 *
 * Each variant keeps its OWN intrinsic aspect ratio (BrandLogo derives width from height per asset) —
 * never one ratio for two lockups, or the wordmark squishes (a fixed bug; do not reintroduce).
 */
export function ThemeLogo({ height = 32, priority = false }: { height?: number; priority?: boolean }) {
  return (
    <>
      <BrandLogo variant="white" height={height} priority={priority} className="logo-dark-only" />
      <BrandLogo variant="color" height={height} priority={priority} className="logo-light-only" />
    </>
  );
}
