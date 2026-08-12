import { describe, it, expect } from "vitest";
import {
  MULTISOURCE_DEFS,
  MULTISOURCE_FORBIDDEN_COLUMNS,
  phoneMatchCandidates,
  matchKeyOrder,
} from "./multisource-constants";

describe("multisource safe-column allowlist (TUGAS 3 guard)", () => {
  it("no source's safeColumns contains a forbidden column (free-text / raw identity / payment / sensitive)", () => {
    for (const def of MULTISOURCE_DEFS) {
      for (const col of def.safeColumns) {
        expect(
          MULTISOURCE_FORBIDDEN_COLUMNS.has(col),
          `${def.table}.${col} is forbidden but listed as safe`,
        ).toBe(false);
      }
    }
  });

  it("every source's labelColumn + statusColumn are within its safeColumns (only read what we list)", () => {
    for (const def of MULTISOURCE_DEFS) {
      expect(def.safeColumns).toContain(def.labelColumn);
      if (def.statusColumn) expect(def.safeColumns).toContain(def.statusColumn);
    }
  });

  it("source keys are unique (registry integrity)", () => {
    const keys = MULTISOURCE_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("matchKeyOrder — email first, phone fallback, skip missing (K-06)", () => {
  it("email present + phone present → [email, phone]", () => {
    expect(matchKeyOrder("a@b.com", "628123")).toEqual(["email", "phone"]);
  });
  it("only phone → [phone]", () => {
    expect(matchKeyOrder(null, "628123")).toEqual(["phone"]);
  });
  it("only email → [email]", () => {
    expect(matchKeyOrder("a@b.com", null)).toEqual(["email"]);
  });
  it("neither → [] (unmatchable)", () => {
    expect(matchKeyOrder(null, null)).toEqual([]);
  });
});

describe("phoneMatchCandidates — raw variants of a normalised 62… phone", () => {
  it("generates 62…, +62…, 0…, and bare national for a valid canon", () => {
    const c = phoneMatchCandidates("628123456789");
    expect(c).toContain("628123456789"); // 62…
    expect(c).toContain("+628123456789"); // +62…
    expect(c).toContain("08123456789"); // 0…
    expect(c).toContain("8123456789"); // bare national
  });
  it("returns [] for a non-canonical input (must be normalizePhoneID output first)", () => {
    expect(phoneMatchCandidates("08123456789")).toEqual([]); // not 62… form
    expect(phoneMatchCandidates("+628123")).toEqual([]); // has +
    expect(phoneMatchCandidates(null)).toEqual([]);
    expect(phoneMatchCandidates("")).toEqual([]);
  });
  it("de-duplicates (no repeated candidate)", () => {
    const c = phoneMatchCandidates("628123456789");
    expect(new Set(c).size).toBe(c.length);
  });
});
