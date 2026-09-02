/**
 * Pure customer-id set algebra for the segment resolver. No I/O, no server-only imports — so it is
 * directly unit-testable. The resolver folds a multi-value criterion (several programs / RFM buckets)
 * with `unionSets` (OR within the criterion), then `intersectSets` ANDs the criteria together.
 */

/** Union a list of id sets (OR). Empty input → empty set. */
export function unionSets(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const id of Array.from(s)) out.add(id);
  return out;
}

/** Intersect a list of id sets (AND). Iterates the smallest for speed. Empty input → null. */
export function intersectSets(sets: Set<string>[]): Set<string> | null {
  if (sets.length === 0) return null;
  const sorted = [...sets].sort((a, b) => a.size - b.size);
  const [smallest, ...rest] = sorted;
  const out = new Set<string>();
  for (const id of Array.from(smallest)) {
    if (rest.every((s) => s.has(id))) out.add(id);
  }
  return out;
}
