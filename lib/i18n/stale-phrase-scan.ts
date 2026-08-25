/**
 * GUARD for the "written while something didn't exist, then left behind after it landed" class of
 * stale sentence (nav rebuild TUGAS 5). It bit three times: Settings "read-only this sprint",
 * Campaigns/Exports "not built yet", and the segment builder "saving is deferred" — each written when
 * the feature was absent and never revisited when it arrived.
 *
 * The DESIGN is a REVIEW-LIST, not a blunt fail: a pure fail-guard would block legitimately-true notes
 * ("the merge/unmerge flow is not built"), and a docs checklist gets skipped (that's how these
 * survived). So this scans every rendered dictionary string for the suspect phrases and fails on any
 * hit whose PATH is not in an allowlist of entries a human has reviewed and confirmed STILL TRUE —
 * with a date. When such a feature lands, the string AND its allowlist entry must both be removed (the
 * phrase is now false); a NEW suspect phrase fails the build until someone reviews it.
 */

export const SUSPECT_PATTERNS: readonly RegExp[] = [
  /not built yet/i,
  /not yet built/i,
  /belum dibangun/i,
  /belum tersedia/i,
  /this sprint/i,
  /di sprint ini/i,
  /\bdeferred\b/i,
  /menyusul/i,
  /coming soon/i,
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
