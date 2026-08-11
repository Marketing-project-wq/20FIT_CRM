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
