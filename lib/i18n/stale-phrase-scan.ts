/**
 * GUARD for stale sentences in rendered strings. TWO classes, both of which have bitten:
 *
 *  1. FUTURE-PROMISE — "written while something didn't exist, then left behind after it landed"
 *     (nav rebuild TUGAS 5): Settings "read-only this sprint", Campaigns "not built yet", the
 *     segment builder "saving is deferred".
 *  2. REMOVED-FEATURE — a reference to a feature that was later DELETED and never swept from the
 *     strings. The CSV export was removed entirely (K-45), yet the segment-builder and Audience
 *     footers kept saying "ekspor / export" — and the future-promise patterns did not catch it,
 *     because "export" is not a coming-soon phrase. Added `ekspor`/`export` so any rendered mention
 *     of the removed feature fails until it is rewritten.
 *
 * The DESIGN is a REVIEW-LIST, not a blunt fail: a pure fail-guard would block legitimately-true
 * notes, and a docs checklist gets skipped (that's how these survived). So this scans every rendered
 * dictionary string for the suspect phrases and fails on any hit whose PATH is not in an allowlist of
 * entries a human has reviewed and confirmed STILL TRUE — with a date. When such a feature lands (or
 * is removed), the string AND its allowlist entry must both be removed; a NEW suspect phrase fails the
 * build until someone reviews it.
 */

export const SUSPECT_PATTERNS: readonly RegExp[] = [
  // Class 1 — future promise.
  /not built yet/i,
  /not yet built/i,
  /belum dibangun/i,
  /belum tersedia/i,
  /this sprint/i,
  /di sprint ini/i,
  /\bdeferred\b/i,
  /menyusul/i,
  /coming soon/i,
  // Class 2 — reference to a REMOVED feature (CSV export, deleted K-45). No trailing boundary so
  // "export/exporting/exported" and "ekspor/mengekspor/diekspor" all match.
  /ekspor/i,
  /export/i,
] as const;

export interface PhraseHit {
  path: string;
  value: string;
  pattern: string;
}

/** Walk a nested dictionary object, calling `visit` on every string leaf with its dotted path. */
function walk(node: unknown, path: string[], visit: (path: string, value: string) => void): void {
  if (typeof node === "string") {
    visit(path.join("."), node);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, [...path, k], visit);
  }
}

/**
 * Return every string leaf that matches a suspect phrase and whose path is NOT allowlisted.
 * `allowPaths` holds dotted paths confirmed still-true (see the test's REVIEWED list).
 */
export function scanStalePhrases(dict: unknown, allowPaths: ReadonlySet<string>): PhraseHit[] {
  const out: PhraseHit[] = [];
  walk(dict, [], (path, value) => {
    if (allowPaths.has(path)) return;
    for (const p of SUSPECT_PATTERNS) {
      if (p.test(value)) {
        out.push({ path, value, pattern: String(p) });
        break;
      }
    }
  });
  return out;
}
