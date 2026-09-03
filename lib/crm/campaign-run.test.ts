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
  // ── precedence: DEFERRAL outranks failure. See the block comment below for why. ──
  {
    name: "the 12k campaign's day 1 — sent + deferred + a few failures → 'sending'",
    outcome: { sent: 1000, failed: 3, deferredDailyLimit: 11000 },
    expected: "sending",
  },
  {
    name: "nothing sent yet, some failed, most deferred → still 'sending'",
    outcome: { sent: 0, failed: 5, deferredDailyLimit: 900 },
    expected: "sending",
  },
  // ── the failure branches decide the END state, i.e. only when nothing is left to send ──
  {
    name: "failures with nothing deferred and nothing sent → 'failed'",
    outcome: { sent: 0, failed: 5, deferredDailyLimit: 0 },
    expected: "failed",
  },
  {
    name: "failures with nothing deferred, some sent → 'partial'",
    outcome: { sent: 100, failed: 5, deferredDailyLimit: 0 },
    expected: "partial",
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

/**
 * THE STRANDED-RUN CASE (T-46). The first version of this rule put the failure branches ABOVE the
 * deferral branch, reasoning that a failing run must not invite a resume. Applied to the ~12,021-
 * person completion campaign — which HAS to be split across days by the daily ceiling — that rule
 * does this:
 *
 *   day 1 → {sent: 1000, deferred: 11000, failed: 3}
 *        → 'partial'                    (because failure was checked first)
 *        → 'partial' is not resumable   (deliberately, K-55)
 *        → the 11,000 are stranded; the operator's only move is a NEW run
 *        → a new run means a new campaign_id
 *        → buildIdempotencyKey is {campaign_id}:{customer}:{channel} → all-new keys
 *        → the 1,000 who already received it are NOT skipped, and receive it again.
 *
 * Three incidental failures, a double send to a thousand people. These three cases are the lock.
 */
describe("nextRunStatus — deferral outranks failure (a run with people left to send is 'sending')", () => {
  it("day 1 of the split campaign stays resumable: {sent 1000, failed 3, deferred 11000} → 'sending'", () => {
    const status = nextRunStatus({ ...base, sent: 1000, failed: 3, deferredDailyLimit: 11000 });
    expect(status).toBe("sending");
    // The half that makes it matter: resuming THIS run keeps the same campaign_id, so the 1,000
    // already-sent recipients are skipped by their existing idempotency keys.
    expect(isResumableRunStatus(status)).toBe(true);
  });

  it("a run with nothing left to send and nothing delivered is 'failed'", () => {
    expect(nextRunStatus({ ...base, sent: 0, failed: 5, deferredDailyLimit: 0 })).toBe("failed");
  });

  it("a run with nothing left to send and some delivered is 'partial'", () => {
    expect(nextRunStatus({ ...base, sent: 100, failed: 5, deferredDailyLimit: 0 })).toBe("partial");
  });

  it("a REAL wall still beats the deferral branch — a halted run never says 'sending'", () => {
    // The guard that makes the ordering safe: systemic failure exits at step 1, so "keep going"
    // can never be the answer for a run that hit a wall, however many recipients remain.
    expect(nextRunStatus({ ...base, sent: 1000, failed: 20, deferredDailyLimit: 11000, stoppedConsecutiveFailures: true })).toBe("stopped");
    expect(nextRunStatus({ ...base, sent: 1000, failed: 60, deferredDailyLimit: 11000, stoppedHighBounce: true })).toBe("stopped");
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

  it("a FINISHED run that had failures is never resumable", () => {
    // Walk the rule itself rather than a hand-written list. Scoped to runs with nothing deferred:
    // a run that still has recipients waiting is 'sending' and MUST stay resumable (T-46), so the
    // property being locked here is "nothing left to send + something failed → never offered again".
    for (const c of CASES) {
      const outcome = { ...base, ...c.outcome };
      if (outcome.failed === 0 || outcome.deferredDailyLimit > 0) continue;
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
  });

  it("getRunForPair re-checks the status — the run id comes from the CLIENT", () => {
    // The list is only what the composer OFFERS. The chosen run id travels from the browser, so
    // without this second check the id of a finished run could be handed straight back and resumed.
    // With run 5f5f3a57 (status 'sent', 18,119 failures) sitting in the table, that difference is
    // 18k people contacted twice.
    const src = readFileSync(join(process.cwd(), "lib/crm/campaign-run.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function getRunForPair"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    expect(body).toContain("if (!isResumableRunStatus(run.status)) return null;");
  });
});
