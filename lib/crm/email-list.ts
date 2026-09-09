/**
 * Manual (static) email-list segment helpers — client-safe (the paste box, the CSV uploader, the save
 * action and the preview action all import from here, so none can disagree about what counts as a
 * valid address or how big a list may be).
 */

/**
 * Parse a raw email blob (pasted text OR one CSV column joined) into clean addresses: split on
 * whitespace/comma/semicolon, trim, lowercase, keep only those containing '@', de-duplicated. This is
 * the SAME rule the save action stores by, so the preview count equals what gets saved. It does NOT
 * canonicalise beyond lowercase — resolveEmailListRecipients runs normalizeEmail at resolve time.
 */
export function parseEmailListInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes("@")),
    ),
  );
}

/**
 * URL-safe chunk for resolving an email list against master_customer via `.in("email_normalized", …)`.
 * supabase-js puts every value in the request URL; past the gateway's ~24 KB limit the request is
 * rejected (T-69). 300 addresses ≈ 12 KB even at the table's longest emails — comfortably under. Used
 * by BOTH resolveEmailListRecipients (send) and the preview so the two chunk identically.
 */
export const EMAIL_IN_CHUNK = 300;

/**
 * Hard cap on a manual email-list segment. MEASURED (⏱ 9 Sep 2026), not guessed — the same discipline
 * as the 15.000 import cap. The binding cost is RESOLVE: each 300-address chunk is one full seq scan
 * of master_customer (~34 ms warm, ~600 ms cold — the only email index is PARTIAL so `IN(list)` can't
 * use it, T-68), and the table caches after the first scan, so resolving 5.000 addresses ≈ one cold
 * scan + 16 warm chunks ≈ ~1,5 s — ~5× under the 8 s budget the import cap uses. The largest real
 * wave list is 258 addresses; 5.000 is ~20× that, with room for a whole-event union of every wave.
 * Stored as jsonb in the segment definition (~150 KB at the cap). Enforced in preview AND save.
 */
export const MAX_EMAIL_LIST = 5_000;
