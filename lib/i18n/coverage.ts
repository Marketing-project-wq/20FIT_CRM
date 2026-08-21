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
 * EXHAUSTIVENESS (Sprint 4F): ALL_SCREENS is the single source of truth for the ScreenId union.
 * Every id MUST be classified as either BILINGUAL (done) or PENDING (marker shown, not yet
 * bilingual). coverage.test.ts fails if the two sets don't partition ALL_SCREENS exactly — so a
 * NEW screen cannot be born silent: it has to be declared bilingual or explicitly pending.
 */

/** Every screen that renders a CoverageNotice. Single source of truth for ScreenId. */
export const ALL_SCREENS = [
  "quality",
  "profile",
  "segments",
  "consent",
  "audit",
  "search",
  "diagnostik",
] as const;

export type ScreenId = (typeof ALL_SCREENS)[number];

/** Screens whose every string is available in both languages. Membership hides the marker.
 *  A screen is added ONLY once every string it renders is routed through the dictionary. */
export const BILINGUAL_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  "search", // /audience page — pool + single-person search + quality banner (Sprint 4D)
  "consent", // /consent — register + suppression list + record/lift dialogs + write-path API messages (Sprint 4D)
  "segments", // /segments — builder + AI assistant + AND/OR tree (readback + validator lang-aware) + 2 API routes (Sprint 4E)
  "audit", // /settings governance page — audit log panel + RBAC roles panel + retention/gap/artifact notes + api/audit (Sprint 4E)
]);

/** Screens that render the marker but are NOT bilingual yet — a LABELLED work-in-progress, never
 *  a silent mix. Every ScreenId must be here or in BILINGUAL_SCREENS (coverage.test.ts enforces it).
 *  Move an id from here to BILINGUAL_SCREENS the moment its screen is fully translated. */
export const PENDING_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  "quality", // /quality — largest surface; not yet translated (Sprint 4F+)
  "profile", // /audience/[id] profile detail — not yet translated (Sprint 4F+)
  "diagnostik", // /settings/diagnostik — verification status page; marked, translation deferred (Sprint 4F)
]);

export function isScreenBilingual(screen: ScreenId): boolean {
  return BILINGUAL_SCREENS.has(screen);
}
