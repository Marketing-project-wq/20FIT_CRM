/**
 * Cross-tab navigation for the Campaigns composer ⇄ Segmen bounce-back. The tab query-values live in
 * exactly ONE place here (not scattered as string literals), which also keeps these Indonesian-looking
 * route tokens out of the bilingual screen components the i18n guard scans — they are URL values, not
 * user-facing text.
 */

/** The composer tab ("Buat Kampanye"). */
export const CAMPAIGN_COMPOSE_TAB = "kirim";
/** The segment-builder tab. */
export const CAMPAIGN_SEGMENT_TAB = "segmen";

// ⚠️ These are URL navigations ON PURPOSE, not client tab-state toggles. The composer's draft
// bounce-back (and browser Back — scenario C) depends on the Campaigns tabs being a `?tab=` searchParam
// on one server route: switching tab re-renders the server page, so CampaignFlow unmounts/remounts and
// its restore effect re-runs. If these ever become client-state setters instead of router.push to a
// `?tab=` URL, the Back-button restore breaks silently. See campaign-flow.tsx's restore effect and
// campaign-tab-is-searchparam.test.ts.

/** Composer → Segmen tab, marked so the builder can bounce back afterwards. */
export function segmentBuilderUrlFromCompose(): string {
  return `/campaigns?tab=${CAMPAIGN_SEGMENT_TAB}&returnTo=${CAMPAIGN_COMPOSE_TAB}`;
}

/** Segmen tab → composer, carrying the just-created segment id so it can be auto-selected. */
export function composeUrlWithNewSegment(segmentId: string): string {
  return `/campaigns?tab=${CAMPAIGN_COMPOSE_TAB}&newSegment=${encodeURIComponent(segmentId)}`;
}

/** Back to the composer without creating a segment (draft is restored from sessionStorage). */
export function composeUrl(): string {
  return `/campaigns?tab=${CAMPAIGN_COMPOSE_TAB}`;
}
