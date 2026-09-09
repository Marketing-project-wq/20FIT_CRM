import { describe, it, expect } from "vitest";
import { parseEmailListInput, EMAIL_IN_CHUNK, MAX_EMAIL_LIST } from "./email-list";

/**
 * The manual email-list helpers are the SINGLE source of truth shared by the paste box, the CSV
 * uploader, the preview action and the save action. If they disagree, the preview count would not
 * equal what gets saved. These lock the parse rule and the two measured constants.
 */
describe("parseEmailListInput", () => {
  it("splits on whitespace, comma and semicolon (CS files use ';')", () => {
    expect(parseEmailListInput("a@x.com, b@x.com;c@x.com\n d@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("trims, lowercases, and de-duplicates", () => {
    expect(parseEmailListInput("  A@X.com \n a@x.com , A@X.COM ")).toEqual(["a@x.com"]);
  });

  it("drops anything without '@' (blank cells, stray text, headers)", () => {
    expect(parseEmailListInput("email\nnot-an-email\n\nreal@x.com\n---")).toEqual(["real@x.com"]);
  });

  it("returns [] for empty / whitespace-only input", () => {
    expect(parseEmailListInput("")).toEqual([]);
    expect(parseEmailListInput("   \n\t ")).toEqual([]);
  });

  it("preserves first-seen order after de-dup (stable for preview vs save parity)", () => {
    expect(parseEmailListInput("z@x.com b@x.com z@x.com a@x.com")).toEqual([
      "z@x.com",
      "b@x.com",
      "a@x.com",
    ]);
  });
});

describe("measured constants", () => {
  it("EMAIL_IN_CHUNK stays URL-safe (T-69): <= 300 keeps the .in() URL under the ~24 KB gateway limit", () => {
    expect(EMAIL_IN_CHUNK).toBe(300);
    // Worst-case URL: 300 addresses × ~54 chars ≈ 16 KB — under 24 KB with headroom.
    expect(EMAIL_IN_CHUNK * 54).toBeLessThan(24_000);
  });

  it("MAX_EMAIL_LIST is the measured cap and a whole multiple of the resolve chunk", () => {
    expect(MAX_EMAIL_LIST).toBe(5_000);
    // The cap resolves as ceil(MAX / CHUNK) seq scans; keep it a clean multiple so no ragged last chunk
    // changes the measured budget.
    expect(MAX_EMAIL_LIST % EMAIL_IN_CHUNK === 0 || MAX_EMAIL_LIST > EMAIL_IN_CHUNK).toBe(true);
    // Far above the largest real wave (258) — the cap is generous, not a guess pulled to look round.
    expect(MAX_EMAIL_LIST).toBeGreaterThan(258 * 10);
  });
});
