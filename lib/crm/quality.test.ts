import { describe, it, expect } from "vitest";
import {
  pct,
  fillTone,
  issueTone,
  formatCount,
  formatPct,
  VERIFIED_ARTIFACTS,
} from "./quality-types";

describe("pct", () => {
  it("computes a straight percentage", () => {
    expect(pct(5786, 82253)).toBeCloseTo(7.0344, 3);
    expect(pct(1112, 82253)).toBeCloseTo(1.3519, 3);
  });

  it("keeps 0 and 100 exact — the two values people read literally", () => {
    expect(pct(0, 82253)).toBe(0);
    expect(pct(82253, 82253)).toBe(100);
  });

  it("returns 0 rather than NaN/Infinity when there is nothing to divide by", () => {
    // An empty table must render "0,00%", never "NaN%" — a broken-looking number
    // gets dismissed as a UI bug instead of read as the fact that the table is empty.
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 0)).toBe(0);
    expect(pct(Number.NaN, 10)).toBe(0);
  });
});

describe("fillTone", () => {
  it("is green only at or above 95%", () => {
    expect(fillTone(100)).toBe("green");
    expect(fillTone(95)).toBe("green");
    expect(fillTone(94.99)).toBe("amber");
  });

  it("is amber down to 60% and red below", () => {
    expect(fillTone(60)).toBe("amber");
    expect(fillTone(59.99)).toBe("red");
  });

  it("marks a totally empty field red", () => {
    // gender / date_of_birth / address are all 0% — they must not read as neutral.
    expect(fillTone(0)).toBe("red");
  });

  it("marks the real city and LTV rates red", () => {
    expect(fillTone(pct(5786, 82253))).toBe("red");
    expect(fillTone(pct(1112, 82253))).toBe("red");
  });
});

describe("issueTone", () => {
  it("is green only when the count is exactly zero", () => {
    expect(issueTone(0)).toBe("green");
    expect(issueTone(1)).toBe("amber");
    expect(issueTone(6361)).toBe("amber");
  });

  it("never returns red — no PRD severity threshold exists to justify it", () => {
    for (const n of [0, 1, 15, 31, 32, 6361, 82253]) {
      expect(issueTone(n)).not.toBe("red");
    }
  });
});

describe("formatting", () => {
  it("groups counts the Indonesian way", () => {
    expect(formatCount(82253)).toBe("82.253");
    expect(formatCount(0)).toBe("0");
  });

  it("keeps two decimals so 7,03% and 1,35% stay distinguishable", () => {
    expect(formatPct(pct(5786, 82253))).toBe("7,03%");
    expect(formatPct(pct(1112, 82253))).toBe("1,35%");
    expect(formatPct(0)).toBe("0,00%");
    expect(formatPct(100)).toBe("100,00%");
  });
});

describe("VERIFIED_ARTIFACTS", () => {
  it("states every finding with detail, since these are the only static numbers on the screen", () => {
    expect(VERIFIED_ARTIFACTS.length).toBeGreaterThan(0);
    for (const a of VERIFIED_ARTIFACTS) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.detail.length).toBeGreaterThan(0);
    }
  });
});
