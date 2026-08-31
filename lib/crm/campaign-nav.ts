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
