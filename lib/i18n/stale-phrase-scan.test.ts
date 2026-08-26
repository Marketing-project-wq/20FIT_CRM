import { describe, it, expect } from "vitest";
import { id } from "./messages/id";
import { en } from "./messages/en";
import { scanStalePhrases } from "./stale-phrase-scan";

/**
 * GUARD (nav rebuild TUGAS 5): rendered strings must not carry a "coming soon / not built yet /
 * deferred / this sprint" phrase UNLESS a human has reviewed the string and confirmed it is STILL
 * TRUE. Each allowlisted path below is dated; when its feature lands, the string AND the entry here
 * must both be removed. A NEW suspect phrase (or a newly-false one) fails this test.
 */

// Paths reviewed 2026-08-25 and confirmed STILL TRUE (the feature the phrase refers to genuinely does
// not exist yet). Remove an entry the moment its feature ships.
const REVIEWED_STILL_TRUE: ReadonlySet<string> = new Set([
  "coverage.notEnglishYet",                   // English translation genuinely absent for this string
  "stubs.comingSoon",                          // Workflows author surface — still a ComingSoon stub
  "messaging.waSubtitle",                      // WhatsApp Business API credentials genuinely not set (panel reads "Not connected")
  "quality.caption.duplicates",               // the merge/unmerge flow is genuinely not built (numbers only rise)
  "profile.provinceCodeB",                    // province/region reference data genuinely not available
  "campaignsPage.steps.step0WhatsappDesc",    // reviewed 2026-08-26: WhatsApp Business integration genuinely not built yet
]);

describe("stale-phrase guard bites", () => {
  it("flags an unreviewed suspect string, and passes once its path is allowlisted", () => {
    const sample = { screen: { note: "This form is not built yet." } };
    const hits = scanStalePhrases(sample, new Set());
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe("screen.note");
    // reviewing it (adding the path) silences it — exactly how a still-true phrase is permitted
    expect(scanStalePhrases(sample, new Set(["screen.note"]))).toEqual([]);
  });

  it("flags a reference to the REMOVED export feature (the class the guard missed before)", () => {
    // The Audience + segment footers kept saying "ekspor / export" after CSV export was deleted
    // (K-45); the future-promise patterns did not catch it. These now fail.
    expect(scanStalePhrases({ a: { footer: "simpan kriteria & ekspor digerbangi peran" } }, new Set()))
      .toHaveLength(1);
    expect(scanStalePhrases({ a: { footer: "saving criteria & exporting are role-gated" } }, new Set()))
      .toHaveLength(1);
  });
});

describe("no unreviewed stale 'coming soon / deferred' phrases in rendered strings", () => {
  for (const [lang, dict] of [["id", id], ["en", en]] as const) {
    it(`${lang}: every suspect phrase is on the reviewed-still-true allowlist`, () => {
      const hits = scanStalePhrases(dict, REVIEWED_STILL_TRUE);
      expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
    });
  }
});
