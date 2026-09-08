import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// bod-snapshot.ts is pure (no server-only), but the mock stays harmless and cheap.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  parseBodSnapshot,
  isBodSnapshotStale,
  bodSnapshotAgeHours,
  BOD_STALE_AFTER_HOURS,
} from "./bod-snapshot";

/**
 * GUARD (K-63): the board page's single timestamp comes from the SNAPSHOT, never from the clock —
 * and the page says so out loud once the snapshot goes stale.
 *
 * WHY THIS EXISTS — read before "fixing" a failure by weakening it. The nightly function that
 * writes the snapshot now reads a dozen tables owned by OTHER divisions (arena_*, gym_*,
 * clinic_patients, my20fit_profile, cf_hyrox_participants). If one of those teams renames a
 * column, that night's refresh throws and `crm_mirror_meta.dashboard_stats` keeps yesterday's
 * contents — silently, because nothing watches cron.job_run_details (T-61).
 *
 * Stamp the page with `now()` and that failure becomes invisible in the worst possible way: real
 * numbers, wrong date, indefinitely, on the screen a board makes decisions from. Stamp it with the
 * snapshot's own `refreshed_at` and the clock simply stops — and a stopped clock is an alarm. The
 * >26h banner turns that alarm into a sentence, because nobody reads a board screen by checking
 * whether a date is two days old.
 *
 * A page that fails loudly beats a page that lies quietly. That is the whole rule.
 */

// Strip block comments and line comments so a source scan tests the CODE, not the prose that
// describes it. (Written as line comments on purpose: a JSDoc block naming a comment terminator
// closes itself early — which is exactly how this file failed to load on the first attempt.)
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const BLOB = {
  reach: { emailable: 82213, whatsappable: 81679, pool_total: 82830, ever_contacted: 126 },
  loads: [
    { at: "2026-04-20T11:28:33.232369+00:00", count: 81178 },
    { at: "2026-08-27T13:39:03.523856+00:00", count: 577 },
  ],
  delivery: { delivered: 121, bounced: 5, failed: 18119, unsubscribed: 1, workflow_queued: 36 },
  not_in_crm: { distinct_people: 1376 },
  engagement: { membership: 67828, event: 18247, arena: 2075, clinic: 1014, gym: 2 },
};

const REFRESHED = "2026-09-07T06:14:02.320296+00:00";

describe("BOD snapshot — the timestamp is the snapshot's, never the clock's", () => {
  it("measuredAt is exactly the blob row's refreshed_at, passed through untouched", () => {
    const snap = parseBodSnapshot(BLOB, REFRESHED);
    expect(snap.measuredAt).toBe(REFRESHED);
  });

  it("parseBodSnapshot cannot reach a clock at all — its only inputs are the blob and the stamp", () => {
    // Two calls, an hour of wall-clock apart in principle, must be byte-identical: the function is
    // pure. This is the structural half of the rule — a future `new Date()` inside it fails here.
    expect(parseBodSnapshot(BLOB, REFRESHED)).toEqual(parseBodSnapshot(BLOB, REFRESHED));
    expect(parseBodSnapshot(BLOB, null).measuredAt).toBeNull();
  });

  it("the page component never constructs a date — the value is rendered from data.measuredAt", () => {
    // Source scan, because this is the one thing a unit test of a pure function cannot see: the
    // component could ignore `measuredAt` and print `new Date()`. It reads the file rather than
    // trusting a comment.
    const ui = stripComments(
      readFileSync(join(process.cwd(), "components", "dashboard", "bod-content.tsx"), "utf8"),
    );
    expect(ui).toContain("data.measuredAt");
    // Comments are stripped first ON PURPOSE: the rule is about what the code DOES, and the file
    // legitimately explains the rule in prose that names the very calls it must not make. A guard
    // that cannot tell an explanation from an instruction would push the next person to delete the
    // explanation — which is the part worth keeping.
    expect(ui).not.toMatch(/new Date\(\)/);
    expect(ui).not.toMatch(/Date\.now\(\)/);

    // The page passes the clock in for the STALENESS decision only, never as the stamp.
    //
    // THIS PATH MOVED on 7 Sep 2026, and the move is the reason to read this comment. The summary
    // used to be its own route at app/(app)/bod/page.tsx; it is now the top layer of the Dashboard
    // at app/(app)/page.tsx, and /bod is a redirect. A source-scanning guard that keeps pointing at
    // a file which no longer does the thing is the worst kind of guard — it can go green forever
    // while checking nothing. When this assertion moved it went RED first (the redirect stub has no
    // fetch and no clock), which is how it should fail; the fix was to re-aim it, never to relax it.
    //
    // existsSync is asserted deliberately: if the path is ever wrong, this fails LOUDLY instead of
    // reading an empty string and passing a `toContain` on nothing.
    const pagePath = join(process.cwd(), "app", "(app)", "page.tsx");
    expect(existsSync(pagePath), `${pagePath} must exist — the guard is pointed at a real file`).toBe(true);
    const page = readFileSync(pagePath, "utf8");
    expect(page).toContain("nowMs={Date.now()}");
    expect(page).toContain("fetchBodSnapshot");

    // And /bod must stay a redirect, not quietly become a second screen again.
    const bod = stripComments(readFileSync(join(process.cwd(), "app", "(app)", "bod", "page.tsx"), "utf8"));
    expect(bod).toContain("redirect");
    expect(bod).not.toContain("fetchBodSnapshot");
  });

  it("every figure on the page comes from the blob, so a stale blob makes ALL of them stale together", () => {
    const snap = parseBodSnapshot(BLOB, REFRESHED);
    expect(snap.reach).toEqual({ emailable: 82213, whatsappable: 81679, poolTotal: 82830, everContacted: 126 });
    expect(snap.health.failed).toBe(18119);
    expect(snap.notInCrmDistinct).toBe(1376);
    expect(snap.loads).toHaveLength(2);
    expect(snap.units.map((u) => u.unit)).toEqual(["membership", "event", "arena", "clinic", "gym"]);
  });
});

describe("BOD snapshot — staleness is stated, not left to be noticed", () => {
  const at = Date.parse(REFRESHED);

  it("fresh within the threshold", () => {
    expect(isBodSnapshotStale(REFRESHED, at + 1 * 3600_000)).toBe(false);
    expect(isBodSnapshotStale(REFRESHED, at + 25 * 3600_000)).toBe(false);
  });

  it("stale past the threshold — one missed night is visible the next morning", () => {
    expect(BOD_STALE_AFTER_HOURS).toBe(26);
    expect(isBodSnapshotStale(REFRESHED, at + 27 * 3600_000)).toBe(true);
    expect(isBodSnapshotStale(REFRESHED, at + 50 * 3600_000)).toBe(true);
  });

  it("26h, not 24h, so a cron that starts a few minutes late is not called a failure", () => {
    // A normal daily cycle plus an hour of slack must still read as fresh.
    expect(isBodSnapshotStale(REFRESHED, at + 24 * 3600_000 + 30 * 60_000)).toBe(false);
  });

  it("never-refreshed and unparseable both count as STALE — 'never computed' is not 'fresh'", () => {
    expect(isBodSnapshotStale(null, Date.now())).toBe(true);
    expect(isBodSnapshotStale("not a date", Date.now())).toBe(true);
    expect(bodSnapshotAgeHours(null, Date.now())).toBeNull();
  });

  it("age is reported in whole hours for the warning text", () => {
    expect(bodSnapshotAgeHours(REFRESHED, at + 30 * 3600_000 + 59 * 60_000)).toBe(30);
  });
});

describe("BOD snapshot — a blob missing a key FAILS rather than rendering zeros", () => {
  it("a pre-migration six-key blob throws (this is exactly what a rollback leaves behind)", () => {
    const old = { engagement: BLOB.engagement, rfm: {}, fitco: {}, ecosystem: {}, candidates: {}, sources: {} };
    expect(() => parseBodSnapshot(old, REFRESHED)).toThrow(/reach/);
  });

  it.each(["reach", "loads", "delivery", "not_in_crm", "engagement"])(
    "a blob missing `%s` throws instead of showing 0",
    (key) => {
      const partial: Record<string, unknown> = { ...BLOB };
      delete partial[key];
      expect(() => parseBodSnapshot(partial, REFRESHED)).toThrow(new RegExp(key));
    },
  );

  it("an absent row throws — 'never written' must never render as measured zeros", () => {
    expect(() => parseBodSnapshot(null, null)).toThrow(/never been written/);
  });
});
