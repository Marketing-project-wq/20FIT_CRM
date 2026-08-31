/**
 * The workflow status badge, as a PURE function of `is_active` — so the screen can never disagree with
 * the data (T-38 follow-up: a badge that read "Active" while is_active=false would let an operator run
 * a paused workflow without ever suspecting it). One source of truth, unit-tested; the component only
 * renders what this returns. `key` is the i18n key for the label.
 */
export interface WorkflowBadge {
  tone: "green" | "neutral";
  key: "statusActive" | "statusPaused";
}

export function workflowStatusBadge(isActive: boolean): WorkflowBadge {
  return isActive ? { tone: "green", key: "statusActive" } : { tone: "neutral", key: "statusPaused" };
}
