import { describe, it, expect } from "vitest";
import { candidateFreshness, CANDIDATE_STALE_DAYS } from "./candidate-freshness";

/**
 * The candidate card's freshness verdict is a PURE function of the data's own newest-row timestamp,
 * so the "looked fresh but was frozen" bug (TEMUAN.md) can never come back silently: the age is
 * computed here, not read off the mirror's refresh time.
 */

// A fixed "now" so every case is deterministic — 2026-09-09T10:00:00Z.
const NOW = Date.parse("2026-09-09T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("candidateFreshness", () => {
  it("the real production case: the single 21 Aug backfill batch reads as stale (18 days)", () => {
    // The shape PostgREST actually serialises timestamptz as: ISO, microseconds, `+00:00` offset.
    const out = candidateFreshness("2026-08-21T15:44:15.665587+00:00", NOW);
    expect(out.ageDays).toBe(18);
    expect(out.isStale).toBe(true);
    expect(out.asOf).toBe("2026-08-21T15:44:15.665587+00:00");
  });

  it("a bare two-digit offset (…+00, not valid ISO) still parses — the fix can't go silently inert", () => {
    // Postgres' own text render uses a space + `+00`; a `T` + `+00` is the one Date.parse chokes on.
    // Both must yield the same 18-day verdict, or the staleness warning could vanish on a format quirk.
    expect(candidateFreshness("2026-08-21 15:44:15.665587+00", NOW).ageDays).toBe(18);
    expect(candidateFreshness("2026-08-21T15:44:15.665587+00", NOW).ageDays).toBe(18);
    expect(candidateFreshness("2026-08-21T15:44:15.665587+00", NOW).isStale).toBe(true);
  });

  it("data from today is fresh (age 0, not stale)", () => {
    const out = candidateFreshness(daysAgo(0), NOW);
    expect(out.ageDays).toBe(0);
    expect(out.isStale).toBe(false);
  });

  it("exactly CANDIDATE_STALE_DAYS old is NOT yet stale (strictly greater-than boundary)", () => {
    const out = candidateFreshness(daysAgo(CANDIDATE_STALE_DAYS), NOW);
    expect(out.ageDays).toBe(CANDIDATE_STALE_DAYS);
    expect(out.isStale).toBe(false);
  });

  it("one day past the threshold IS stale", () => {
    const out = candidateFreshness(daysAgo(CANDIDATE_STALE_DAYS + 1), NOW);
    expect(out.ageDays).toBe(CANDIDATE_STALE_DAYS + 1);
    expect(out.isStale).toBe(true);
  });

  it("null asOf → no verdict (age null, not stale): 'unmeasured' is never rendered as fresh or as 0", () => {
    expect(candidateFreshness(null, NOW)).toEqual({ asOf: null, ageDays: null, isStale: false });
  });

  it("an unparseable timestamp → age null, not stale (never NaN days on screen)", () => {
    const out = candidateFreshness("not-a-date", NOW);
    expect(out.ageDays).toBeNull();
    expect(out.isStale).toBe(false);
    expect(out.asOf).toBe("not-a-date"); // echoed back so the caller can still show it verbatim if it wishes
  });

  it("a future timestamp (clock skew) clamps to age 0, never a negative day count", () => {
    const out = candidateFreshness(daysAgo(-3), NOW);
    expect(out.ageDays).toBe(0);
    expect(out.isStale).toBe(false);
  });
});
