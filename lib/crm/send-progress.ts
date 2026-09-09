/**
 * Progress math for the send status screen (Part A) — pure, so rate/ETA/remaining are unit-tested and
 * the screen only renders. All inputs come from the DATABASE (sent count, run status) + the target the
 * operator confirmed against; NONE from the HTTP connection's fate (K-66: the connection dying is not
 * the send dying).
 */

export interface ProgressView {
  sent: number;
  target: number | null; // null when unknown (e.g. the screen was deep-linked without it)
  remaining: number | null;
  ratePerSec: number | null; // average since the run began; null until at least one send
  etaSeconds: number | null; // null when rate or target unknown, or already done
}

export function computeProgress(input: {
  sent: number;
  target: number | null;
  startedAtMs: number;
  nowMs: number;
}): ProgressView {
  const { sent, target, startedAtMs, nowMs } = input;
  const elapsedSec = Math.max(0, (nowMs - startedAtMs) / 1000);
  const ratePerSec = elapsedSec > 0 && sent > 0 ? sent / elapsedSec : null;
  const remaining = target != null ? Math.max(0, target - sent) : null;
  const etaSeconds =
    ratePerSec && ratePerSec > 0 && remaining != null && remaining > 0
      ? Math.ceil(remaining / ratePerSec)
      : remaining === 0
        ? 0
        : null;
  return { sent, target, remaining, ratePerSec, etaSeconds };
}

/** A run whose status is terminal — the send is over, stop polling. `sending`/`draft` are still live. */
export function isRunTerminal(status: string): boolean {
  return status === "sent" || status === "partial" || status === "failed" || status === "stopped";
}

/** One poll result the progress screen can receive. `network` is a thrown/timed-out fetch — a blip. */
export type PollOutcome =
  | { ok: true; status: string; sent: number }
  | { ok: false; error: "run_not_found" | "denied" | "network" };

export interface ProgressState {
  status: string | null; // last DB-sourced run status; null until the first successful poll
  sent: number;
  notFound: boolean;
}

/**
 * The Part B / K-66 rule, made pure and testable: the progress screen's state is a function of the
 * DATABASE, never of a connection's fate. A successful poll adopts the DB status + sent-count. A
 * `run_not_found` marks not-found. A `network` blip (a thrown or timed-out poll — exactly a dropped
 * connection) changes NOTHING: it never synthesizes a 'failed' status, so a connection drop can never
 * be shown as a failed send. The last DB status stays until the next successful poll replaces it.
 */
export function reduceProgress(prev: ProgressState, outcome: PollOutcome): ProgressState {
  if (outcome.ok) return { status: outcome.status, sent: outcome.sent, notFound: false };
  if (outcome.error === "run_not_found") return { ...prev, notFound: true };
  return prev; // denied / network → keep the last DB-sourced state; never a fabricated failure
}
