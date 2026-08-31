/**
 * Campaign-compose draft — a short-lived snapshot of the composer form, kept ONLY so the operator can
 * pop over to the Segmen tab to build a segment and come back without losing what they typed.
 * Deliberately sessionStorage (per-tab, cleared when the tab closes), NEVER localStorage — a stale
 * draft leaking into a later campaign is worse than losing it. Read/write are wrapped so SSR (no
 * window) and privacy-mode throws never break the page. Versioned so a draft from an older schema is
 * ignored (treated as absent), never restored into a shape the composer no longer understands.
 */

export const CAMPAIGN_DRAFT_KEY = "20fit:campaign-draft";
export const CAMPAIGN_DRAFT_VERSION = 1;

export interface CampaignDraft {
  channel: "email" | null;
  segmentId: string;
  templateKey: string;
  newLabel: string;
  open: 0 | 1 | 2 | 3 | 4;
  when: "now" | "schedule";
  dateWib: string;
  timeWib: string;
}

interface StoredDraft extends CampaignDraft {
  v: number;
}

/** Persist a draft (stamped with the current schema version). No-op (returns false) when storage is
 *  unavailable — never throws. */
export function saveCampaignDraft(draft: CampaignDraft): boolean {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    const stored: StoredDraft = { ...draft, v: CAMPAIGN_DRAFT_VERSION };
    window.sessionStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/** Load a draft, or null if none / unreadable / malformed / a different schema version. Never throws. */
export function loadCampaignDraft(): CampaignDraft | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(CAMPAIGN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof parsed !== "object" || parsed === null) return null;
    // A draft written by an older/newer schema is ignored, not coerced.
    if (parsed.v !== CAMPAIGN_DRAFT_VERSION) return null;
    const open = typeof parsed.open === "number" && parsed.open >= 0 && parsed.open <= 4
      ? (parsed.open as CampaignDraft["open"])
      : 1;
    return {
      channel: parsed.channel === "email" ? "email" : null,
      segmentId: typeof parsed.segmentId === "string" ? parsed.segmentId : "",
      templateKey: typeof parsed.templateKey === "string" ? parsed.templateKey : "",
      newLabel: typeof parsed.newLabel === "string" ? parsed.newLabel : "",
      open,
      when: parsed.when === "schedule" ? "schedule" : "now",
      dateWib: typeof parsed.dateWib === "string" ? parsed.dateWib : "",
      timeWib: typeof parsed.timeWib === "string" ? parsed.timeWib : "09:00",
    };
  } catch {
    return null;
  }
}

/** Remove the draft so it never bleeds into the next compose session. Never throws. */
export function clearCampaignDraft(): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    window.sessionStorage.removeItem(CAMPAIGN_DRAFT_KEY);
  } catch {
    // ignore
  }
}
