/**
 * Translation coverage registry (Sprint 4C). ONE place that lists which deep screens are FULLY
 * bilingual. The coverage marker (components/i18n/coverage-notice.tsx) shows a one-line "not in
 * English yet" banner on any screen NOT in this set when English is selected.
 *
 * WHY A REGISTRY, NOT A PER-SCREEN FLAG: silent language mixing reads as breakage; a LABELLED mix
 * reads as work-in-progress. The marker turns the first into the second. And because each screen's
 * banner is gated on membership HERE, finishing a screen = adding its id to this set, which makes
 * the banner disappear on its own — there is no per-screen cleanup to forget.
 *
 * As each screen is fully translated (every string routed through the dictionary, no Indonesian
 * fallback left in English), add its id below with the sprint that completed it.
 */

export type ScreenId =
  | "quality"
  | "profile"
  | "segments"
  | "consent"
  | "audit"
  | "search";

/** Screens whose every string is available in both languages. Membership hides the marker.
 *  A screen is added ONLY once every string it renders is routed through the dictionary. */
export const BILINGUAL_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  "search", // /audience page — pool + single-person search + quality banner (Sprint 4D)
]);

export function isScreenBilingual(screen: ScreenId): boolean {
  return BILINGUAL_SCREENS.has(screen);
}
