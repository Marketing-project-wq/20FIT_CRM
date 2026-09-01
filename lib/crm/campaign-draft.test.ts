import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  saveCampaignDraft,
  loadCampaignDraft,
  clearCampaignDraft,
  CAMPAIGN_DRAFT_KEY,
  type CampaignDraft,
} from "./campaign-draft";

// The default test env is node (no jsdom, and we must not add a library), so stub a minimal
// sessionStorage on globalThis.window — the same surface the helpers touch.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const store = new MemoryStorage();
const g = globalThis as unknown as { window?: { sessionStorage: MemoryStorage } };
const hadWindow = "window" in globalThis;
g.window = { sessionStorage: store };
afterAll(() => { if (!hadWindow) delete g.window; });

const DRAFT: CampaignDraft = {
  channel: "email",
  segmentId: "seg-123",
  templateKey: "welcome",
  newLabel: "Broadcast Sept #1",
  open: 1,
  when: "schedule",
  dateWib: "2026-09-02",
  timeWib: "08:00",
};

describe("campaign draft (sessionStorage roundtrip)", () => {
  beforeEach(() => { store.clear(); });

  it("restores a saved draft exactly (the bounce-back case)", () => {
    expect(saveCampaignDraft(DRAFT)).toBe(true);
    expect(loadCampaignDraft()).toEqual(DRAFT);
  });

  it("returns null when there is no draft", () => {
    expect(loadCampaignDraft()).toBeNull();
  });

  it("clears the draft so it never leaks into the next session", () => {
    saveCampaignDraft(DRAFT);
    clearCampaignDraft();
    expect(loadCampaignDraft()).toBeNull();
    expect(store.getItem(CAMPAIGN_DRAFT_KEY)).toBeNull();
  });

  it("treats malformed JSON as absent rather than throwing", () => {
    store.setItem(CAMPAIGN_DRAFT_KEY, "{not json");
    expect(loadCampaignDraft()).toBeNull();
  });

  it("normalizes an unexpected shape (right version) to safe defaults", () => {
    store.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify({ v: 1, channel: "sms", when: "whenever", open: 99 }));
    const d = loadCampaignDraft();
    expect(d).not.toBeNull();
    expect(d!.channel).toBeNull();
    expect(d!.when).toBe("now");
    expect(d!.segmentId).toBe("");
    expect(d!.open).toBe(1);
  });

  it("ignores a draft written by a different schema version", () => {
    store.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify({ ...DRAFT, v: 999 }));
    expect(loadCampaignDraft()).toBeNull();
  });

  it("uses the namespaced key", () => {
    saveCampaignDraft(DRAFT);
    expect(store.getItem(CAMPAIGN_DRAFT_KEY)).toContain("Broadcast Sept #1");
  });
});
