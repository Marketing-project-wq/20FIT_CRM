/**
 * Campaign-name validation — the single source of truth shared by the composer (client, on blur +
 * submit) and the send server actions (backend). The name used to be optional and auto-filled; it is
 * now REQUIRED so every row in Delivery History is traceable. Keeping one validator means the client
 * and the server can never disagree about what "valid" is.
 */

export const CAMPAIGN_NAME_MIN = 3;
export const CAMPAIGN_NAME_MAX = 100;

export type CampaignNameError = "required" | "too_short" | "too_long";

export interface CampaignNameResult {
  ok: boolean;
  /** The trimmed name to store, present only when ok. */
  value?: string;
  error?: CampaignNameError;
}

/**
 * Trim, then enforce required + length. Whitespace-only is "required" (empty), not "too_short", so
 * the operator gets the clearest message. Never throws.
 */
export function validateCampaignName(raw: string | null | undefined): CampaignNameResult {
  const value = (raw ?? "").trim();
  if (value.length === 0) return { ok: false, error: "required" };
  if (value.length < CAMPAIGN_NAME_MIN) return { ok: false, error: "too_short" };
  if (value.length > CAMPAIGN_NAME_MAX) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

export type RunChoiceForLabel = { kind: "new"; label: string | null } | { kind: "resume" };
export type RunLabelDecision =
  | { ok: true; label: string | null } // label to store; null = resume (keep the existing run's name)
  | { ok: false; error: CampaignNameError };

/**
 * The server's run-label policy in ONE testable place: a NEW run must carry a valid name; a RESUME
 * keeps the existing run's name and is NOT validated. sendCampaignAction calls this so the rule can't
 * drift from the test.
 */
export function decideRunLabel(run: RunChoiceForLabel): RunLabelDecision {
  if (run.kind === "resume") return { ok: true, label: null };
  const v = validateCampaignName(run.label);
  return v.ok ? { ok: true, label: v.value! } : { ok: false, error: v.error! };
}
