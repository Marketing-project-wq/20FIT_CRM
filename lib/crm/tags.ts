/**
 * THE tag canon. One place that answers "is this a legal tag, and what shape must it have?" —
 * because the alternative is what the owner and I nearly shipped: a pattern written in the prompt,
 * a vocabulary generated in a spreadsheet, and nothing that ever made the two meet. The proposed
 * pattern rejected 7 of the owner's own 22 tags (`format-single` and friends had no namespace;
 * `nilai:<300k` and `nilai:>=1jt` carried `<`, `>`, `=`). Same class as the consent `basis` bug,
 * caught the same way — by testing the rule against the real values (T-51).
 *
 * THREE KINDS OF TAG, and the difference is load-bearing:
 *
 *  1. OPERATOR tags — namespaced, supplied in the CSV's `tags` column. The closed namespace list is
 *     TAG_NAMESPACES. This is the only kind an import may introduce.
 *  2. SYSTEM namespaced — `batch:<uuid>` and `tagged:<uuid>`, written by the import function itself.
 *     An operator MUST NOT be able to supply these: `batch:` decides what a per-batch rollback
 *     DELETES, so a CSV that could inject `batch:<someone-else's-uuid>` could get a real customer
 *     deleted by an unrelated rollback. isOperatorTag refuses them; isStoredTag accepts them.
 *  3. SYSTEM bare — `csv_import` and `activity_ingest`, which carry an underscore and no namespace.
 *     `activity_ingest` is on 577 live master_customer rows (measured 2026-09-04), so a canon that
 *     rejected it would declare production invalid. They are an explicit allowlist, never a pattern.
 *
 * `nilai:` DELIBERATELY DOES NOT SORT ALPHABETICALLY into its own order (di-bawah-300k / 300k-1jt /
 * 1jt-ke-atas). Owner decision 2026-09-04: do NOT add ordering prefixes (`t1-`, `1-`) to the tag
 * values. Display order is the UI's job — NILAI_TAG_ORDER below — not the data's. This note exists
 * so nobody "fixes" it later.
 */

/** Namespaces an OPERATOR may use. Closed on purpose: a new namespace is a vocabulary decision. */
export const TAG_NAMESPACES = [
  "event",
  "format",
  "kategori",
  "nilai",
  "peran",
  "produk",
  "sumber",
  "tipe",
] as const;

/** Namespaces only the import FUNCTION writes. Never accepted from operator input — see above. */
export const SYSTEM_TAG_NAMESPACES = ["batch", "tagged"] as const;

/** Bare (un-namespaced) tags already in production. Allowlist, never a pattern — both hold a `_`. */
export const SYSTEM_BARE_TAGS = ["csv_import", "activity_ingest"] as const;

/**
 * The operator-tag pattern, BUILT FROM the namespace list so the two cannot drift. This exact string
 * is also the regex inside crm_ingest_csv_people — tags.parity.test.ts compares them character for
 * character, the same way consent-vocabulary.parity.test.ts guards the consent vocabulary.
 */
export const OPERATOR_TAG_REGEX_SOURCE = `^(${TAG_NAMESPACES.join("|")}):[a-z0-9][a-z0-9-]*$`;

const OPERATOR_TAG_RE = new RegExp(OPERATOR_TAG_REGEX_SOURCE);
const SYSTEM_TAG_RE = new RegExp(`^(${SYSTEM_TAG_NAMESPACES.join("|")}):[a-z0-9][a-z0-9-]*$`);

/** Display order for the `nilai:` ladder. The data is unordered ON PURPOSE (see the header). */
export const NILAI_TAG_ORDER: readonly string[] = [
  "nilai:di-bawah-300k",
  "nilai:300k-1jt",
  "nilai:1jt-ke-atas",
];

/** Trim + lowercase, nothing else. The same shape of canon as normalizeEmail: predictable, and it
 *  never invents a value — an unfixable tag stays invalid rather than being bent into something. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/** May an IMPORT introduce this tag? Namespaced, from the closed list. Refuses `batch:`/`tagged:`. */
export function isOperatorTag(tag: string): boolean {
  return OPERATOR_TAG_RE.test(tag);
}

/** May this tag exist on a master_customer row at all? Operator tags + everything the system writes. */
export function isStoredTag(tag: string): boolean {
  return (
    isOperatorTag(tag) ||
    SYSTEM_TAG_RE.test(tag) ||
    (SYSTEM_BARE_TAGS as readonly string[]).includes(tag)
  );
}

export interface ParsedTagCell {
  /** Valid operator tags, normalized, de-duplicated, sorted — a stable order so two rows carrying the
   *  same tags produce the same array and diffs stay readable. */
  tags: string[];
  /** Everything rejected, in the order it appeared, normalized so the operator sees what was judged. */
  invalid: string[];
}

/**
 * Parse one CSV `tags` cell. The separator is `|` (the owner's files use it). Empty segments are
 * dropped silently — a trailing `|` is a typo, not a decision. Everything else is either a valid
 * operator tag or reported as invalid: nothing is quietly discarded, because "quietly discarded" is
 * the failure class this whole sprint has been closing.
 */
export function parseTagCell(cell: string | null | undefined): ParsedTagCell {
  const tags: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const segment of (cell ?? "").split("|")) {
    const tag = normalizeTag(segment);
    if (tag === "") continue;
    if (!isOperatorTag(tag)) {
      invalid.push(tag);
      continue;
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  tags.sort();
  return { tags, invalid };
}

/** The system tags a NEW imported person carries, merged with the operator's. Deduplicated, stable. */
export function tagsForNewPerson(batchId: string, operatorTags: readonly string[]): string[] {
  return Array.from(new Set(["csv_import", `batch:${batchId}`, ...operatorTags])).sort();
}

/** The tags added to an EXISTING person. `tagged:` — never `batch:` — so a per-batch rollback, which
 *  deletes on `batch:`, can never reach a row this import merely annotated (T-52). */
export function tagsForExistingPerson(batchId: string, operatorTags: readonly string[]): string[] {
  return Array.from(new Set([`tagged:${batchId}`, ...operatorTags])).sort();
}
