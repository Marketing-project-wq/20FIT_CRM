import { describe, it, expect } from "vitest";
import {
  MULTISOURCE_DEFS,
  MULTISOURCE_FORBIDDEN_COLUMNS,
  CLASS_SCHEDULE_SAFE_COLUMNS,
  CLASS_TYPE_SAFE_COLUMNS,
  CLASS_CHAIN_FORBIDDEN_COLUMNS,
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

describe("class-name chain safe columns (TUGAS 4 guard)", () => {
  it("schedule + type safe columns contain no forbidden free-text (notes/cancelled_reason/created_by)", () => {
    for (const col of [...CLASS_SCHEDULE_SAFE_COLUMNS, ...CLASS_TYPE_SAFE_COLUMNS]) {
      expect(CLASS_CHAIN_FORBIDDEN_COLUMNS.has(col), `${col} is forbidden but listed as safe`).toBe(false);
    }
  });

  it("class sources declare a chain; the schedule FK is read (so it can be resolved)", () => {
    for (const def of MULTISOURCE_DEFS.filter((d) => d.classChain)) {
      const chain = def.classChain!;
      expect(def.safeColumns).toContain(chain.scheduleIdColumn);
      expect(chain.scheduleColumns).toContain("id"); // must be able to key schedules by id
      expect(chain.scheduleColumns).toContain("class_type_id"); // and hop to the type
      expect(chain.typeColumns).toContain("name"); // the whole point
    }
  });

  it("exactly the two class-booking sources carry a chain (not the venue/package/member ones)", () => {
    const withChain = MULTISOURCE_DEFS.filter((d) => d.classChain).map((d) => d.key).sort();
    expect(withChain).toEqual(["arena_class", "gym_class"]);
  });
});

describe("matchKeyOrder — per-source order (K-06), default email-first, clinic phone-first", () => {
  it("default (arena/gym): email present + phone present → [email, phone]", () => {
    expect(matchKeyOrder("a@b.com", "628123")).toEqual(["email", "phone"]);
  });
  it("prefer=phone (clinic): both present → [phone, email] — 12 vs 106 is why", () => {
    expect(matchKeyOrder("a@b.com", "628123", "phone")).toEqual(["phone", "email"]);
  });
  it("prefer=phone but only email present → [email] (skip missing)", () => {
    expect(matchKeyOrder("a@b.com", null, "phone")).toEqual(["email"]);
  });
  it("only phone → [phone] regardless of preference", () => {
    expect(matchKeyOrder(null, "628123")).toEqual(["phone"]);
    expect(matchKeyOrder(null, "628123", "phone")).toEqual(["phone"]);
  });
  it("only email → [email]", () => {
    expect(matchKeyOrder("a@b.com", null)).toEqual(["email"]);
  });
  it("neither → [] (unmatchable)", () => {
    expect(matchKeyOrder(null, null)).toEqual([]);
    expect(matchKeyOrder(null, null, "phone")).toEqual([]);
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
