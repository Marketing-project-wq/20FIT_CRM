import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  nextRunStatus,
  isResumableRunStatus,
  RESUMABLE_RUN_STATUSES,
  type RunOutcomeCounts,
  type RunStatus,
} from "./campaign-run-status";

/**
 * The run-status rule is the pure part of crm_campaign_run wiring: given a completed send's summary,
 * where does the instance land? Two things are locked here.
 *
 * 1. THE TABLE. Data-driven, so every combination is visible as data rather than buried in prose.
 *    The rule used to read only `deferredDailyLimit` + `stoppedHighBounce`, which is why the 3 Sep
 *    2026 run — 124 accepted, 18,119 failed — was written to the database as `sent` (T-42).
 * 2. RESUMABILITY. `partial` and `failed` must NEVER be resumable. Resuming that same run would
 *    re-contact 18,119 people, some of whom had already been reached through another tool. That is
 *    proven here on the constant the query actually uses, plus a source scan that it IS the one used.
 */

const base: RunOutcomeCounts = {
  sent: 0,
  failed: 0,
  deferredDailyLimit: 0,
  stoppedHighBounce: false,
  stoppedConsecutiveFailures: false,
};

const CASES: { name: string; outcome: Partial<RunOutcomeCounts>; expected: RunStatus }[] = [
  // ── the clean end ──
  { name: "everything sent, nothing failed or deferred", outcome: { sent: 100 }, expected: "sent" },
  { name: "an empty run (nothing to do) is still 'sent'", outcome: {}, expected: "sent" },
  // ── deferral ──
  {
    name: "daily limit deferred recipients → more remains, resuming finishes it",
    outcome: { sent: 1000, deferredDailyLimit: 4200 },
    expected: "sending",
  },
  // ── failure, the branch that did not exist ──
  {
    name: "everything failed, nothing sent → 'failed' (this is the 3 Sep shape)",
    outcome: { sent: 0, failed: 18119 },
    expected: "failed",
  },
  { name: "a single failure, nothing sent → 'failed'", outcome: { failed: 1 }, expected: "failed" },
  {
    name: "some sent AND some failed → 'partial', never 'sent'",
    outcome: { sent: 124, failed: 18119 },
    expected: "partial",
  },
  { name: "one failure among many successes → 'partial'", outcome: { sent: 999, failed: 1 }, expected: "partial" },
  // ── precedence: failure outranks deferral ──
  {
    name: "failures + deferrals → 'partial', NOT 'sending' (a failing run must not invite a resume)",
    outcome: { sent: 5, failed: 5, deferredDailyLimit: 900 },
    expected: "partial",
  },
  {
    name: "all-failed + deferrals → 'failed', NOT 'sending'",
    outcome: { sent: 0, failed: 5, deferredDailyLimit: 900 },
    expected: "failed",
  },
  // ── precedence: an auto-stop outranks everything ──
  { name: "bounce auto-stop tripped", outcome: { stoppedHighBounce: true }, expected: "stopped" },
  {
    name: "bounce halt beats a deferral — the halt is the fact to surface",
    outcome: { sent: 500, deferredDailyLimit: 500, stoppedHighBounce: true },
    expected: "stopped",
  },
  {
    name: "bounce halt beats 'partial'",
    outcome: { sent: 40, failed: 3, stoppedHighBounce: true },
    expected: "stopped",
  },
  { name: "consecutive-failure wall tripped", outcome: { failed: 20, stoppedConsecutiveFailures: true }, expected: "stopped" },
  {
    name: "the wall beats 'partial' — 'stopped' says a human must look, 'partial' does not",
    outcome: { sent: 7, failed: 20, stoppedConsecutiveFailures: true },
    expected: "stopped",
  },
];

describe("nextRunStatus (data-driven)", () => {
  for (const c of CASES) {
    it(`${c.name} → '${c.expected}'`, () => {
      expect(nextRunStatus({ ...base, ...c.outcome })).toBe(c.expected);
    });
  }

  it("never reports a run with failures and no successes as 'sent'", () => {
    // The exact defect: for any positive failure count with nothing sent, the answer is never 'sent'.
    for (const failed of [1, 2, 19, 20, 124, 18119]) {
      expect(nextRunStatus({ ...base, failed })).not.toBe("sent");
    }
  });
});

describe("resume gate — 'partial' and 'failed' are NOT resumable", () => {
  it("the resumable set is exactly draft + sending", () => {
    expect([...RESUMABLE_RUN_STATUSES].sort()).toEqual(["draft", "sending"]);
  });

  for (const status of ["partial", "failed", "sent", "stopped"] as const) {
    it(`'${status}' is not resumable`, () => {
      expect(isResumableRunStatus(status)).toBe(false);
      expect(RESUMABLE_RUN_STATUSES).not.toContain(status);
    });
  }

  it("every status a FAILING run can land in is non-resumable", () => {
    // Walk the rule itself rather than a hand-written list: whatever nextRunStatus returns for an
    // outcome that had failures must never be offered for resume.
    for (const c of CASES) {
      const outcome = { ...base, ...c.outcome };
      if (outcome.failed === 0) continue;
      expect(isResumableRunStatus(nextRunStatus(outcome))).toBe(false);
    }
  });

  it("listResumableRuns queries the CONSTANT, not an inline status list", () => {
    // A source scan, because the query lives behind Supabase I/O and cannot be unit-tested here.
    // Re-inlining `["draft", "sending"]` is how a future status would silently become resumable.
    const src = readFileSync(join(process.cwd(), "lib/crm/campaign-run.ts"), "utf8");
    const listFn = src.slice(src.indexOf("export async function listResumableRuns"));
    const body = listFn.slice(0, listFn.indexOf("\n}\n") + 1);
    expect(body).toContain("RESUMABLE_RUN_STATUSES");
    expect(body).not.toMatch(/\.in\(\s*"status"\s*,\s*\[/);
    // getRunForPair is the second lock: a run id handed straight back by the client is re-checked.
    expect(src).toContain("if (!isResumableRunStatus(run.status)) return null;");
  });
});
