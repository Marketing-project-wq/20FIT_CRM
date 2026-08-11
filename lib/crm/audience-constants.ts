/**
 * Constants shared between the server read layer (lib/crm/audience.ts, server-only)
 * and the client audience UI. Kept in a NON server-only module so the client can
 * import them without pulling in the service-role query code.
 */

/** Sentinel filter value for "the NULL-segment cohort". */
export const SEGMENT_NULL = "__null__";

export const AUDIENCE_MAX_PAGE_SIZE = 50; // never ship 82k rows in one request
export const AUDIENCE_DEFAULT_PAGE_SIZE = 25;

/** Known first_unit vocabulary in master_customer as of Sprint 3A (evaluation data). */
export const AUDIENCE_UNITS = ["20fit_data", "arena", "clinic", "gym", "shop"] as const;

/** Known segment vocabulary. The NULL cohort is offered explicitly as its own choice. */
export const AUDIENCE_SEGMENTS = ["new", "potential", "loyal"] as const;

/** Max stored length of a free-text filter value in an audit row (Sprint 3D decision). */
export const FILTER_VALUE_MAX = 60;

/**
 * Cap a free-text filter value for audit metadata, keeping the ORIGINAL length so a
 * truncation is visible. Length counts UTF-16 code units and the cap slices by the
 * same unit (standard JS) — a multi-byte character straddling the boundary may be cut,
 * which is acceptable for an audit label (see the note in /api/audience). Extracted
 * here as a PURE function so it can be unit-tested: a rule expressible as a pure
 * function must have a test.
 */
export function capFilterValue(
  v: string | null | undefined,
  max: number = FILTER_VALUE_MAX,
): { value: string | null; length: number } {
  if (v == null) return { value: null, length: 0 };
  return { value: v.slice(0, max), length: v.length };
}
