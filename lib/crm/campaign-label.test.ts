import { describe, it, expect } from "vitest";
import { formatShortDateWib, defaultCampaignLabel, cronRunLabel } from "./campaign-label";

describe("formatShortDateWib", () => {
  it("renders a short WIB date in Indonesian by default", () => {
    // 2026-08-31T06:00:00Z → 13:00 WIB, same date.
    expect(formatShortDateWib("2026-08-31T06:00:00+00:00")).toBe("31 Agu 2026");
  });

  it("renders English month names when asked", () => {
    expect(formatShortDateWib("2026-08-31T06:00:00+00:00", "en")).toBe("31 Aug 2026");
  });

  it("crosses the day boundary into WIB (UTC+7)", () => {
    // 23:30Z on the 30th is 06:30 WIB on the 31st.
    expect(formatShortDateWib("2026-08-30T23:30:00+00:00")).toBe("31 Agu 2026");
  });

  it("returns null on an unparseable input", () => {
    expect(formatShortDateWib("not-a-date")).toBeNull();
  });
});

describe("defaultCampaignLabel", () => {
  it("names the segment and the date, not a timestamp", () => {
    expect(defaultCampaignLabel("gmail test", "2026-08-31T06:00:00+00:00")).toBe("gmail test · 31 Agu 2026");
  });

  it("is locale-aware", () => {
    expect(defaultCampaignLabel("gmail test", "2026-08-31T06:00:00+00:00", "en")).toBe("gmail test · 31 Aug 2026");
  });

  it("never emits an ISO timestamp", () => {
    const out = defaultCampaignLabel("Segmen A", "2026-08-31T06:00:00+00:00");
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(out).not.toMatch(/\+00:00/);
  });

  it("falls back to the segment name alone if the date is bad", () => {
    expect(defaultCampaignLabel("Segmen A", "garbage")).toBe("Segmen A");
  });

  it("falls back to a generic word if the segment name is empty", () => {
    expect(defaultCampaignLabel("   ", "2026-08-31T06:00:00+00:00")).toBe("Kampanye · 31 Agu 2026");
    expect(defaultCampaignLabel("", "2026-08-31T06:00:00+00:00", "en")).toBe("Campaign · 31 Aug 2026");
  });
});

describe("cronRunLabel", () => {
  const seg = "gmail test";
  const date = "2026-08-31T06:00:00+00:00";

  it("keeps a real stored run_label verbatim (trimmed)", () => {
    expect(cronRunLabel("Promo Ramadan", seg, date)).toBe("Promo Ramadan");
    expect(cronRunLabel("  Promo Ramadan  ", seg, date)).toBe("Promo Ramadan");
  });

  it("falls back to the human default when run_label is NULL", () => {
    expect(cronRunLabel(null, seg, date)).toBe("gmail test · 31 Agu 2026");
    expect(cronRunLabel(undefined, seg, date)).toBe("gmail test · 31 Agu 2026");
  });

  it("falls back when run_label is whitespace-only — the seam a bare ?? would miss", () => {
    // This is the whole point: " " is not null, so `s.runLabel ?? default` would pass it through,
    // and createRun's trim would then write NULL — a cron failure once the column is NOT NULL.
    expect(cronRunLabel(" ", seg, date)).toBe("gmail test · 31 Agu 2026");
    expect(cronRunLabel("\t\n  ", seg, date)).toBe("gmail test · 31 Agu 2026");
  });

  it("is never empty and never an ISO timestamp on the fallback path", () => {
    const out = cronRunLabel("   ", "  ", date);
    expect(out.trim()).not.toBe("");
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
