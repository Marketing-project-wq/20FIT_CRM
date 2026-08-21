import { describe, it, expect } from "vitest";
import { id } from "./messages/id";
import { en } from "./messages/en";
import {
  isWarningKey,
  FORBIDDEN_EN_WARNING_TERMS,
  WARNING_LENGTH_RATIO_MIN,
  WARNING_LENGTH_EXCEPTIONS,
} from "./warning-guards";

/** Collect { path, value } for every string leaf in a dictionary. */
function leaves(obj: Record<string, unknown>, prefix = ""): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...leaves(v as Record<string, unknown>, path));
    else if (typeof v === "string") out.push({ path, value: v });
  }
  return out;
}

const idLeaves = leaves(id);
const enLeaves = leaves(en);
const enByPath = new Map(enLeaves.map((l) => [l.path, l.value]));
const warningPaths = idLeaves.filter((l) => isWarningKey(l.path)).map((l) => l.path);

describe("warning safeguard: no decided-wrong English phrase (nuance preservation)", () => {
  it("has warning keys to guard once the deep screens are translated", () => {
    // Not an assertion of a specific count — just visibility that the guard has a target set.
    expect(Array.isArray(warningPaths)).toBe(true);
  });

  for (const path of warningPaths) {
    it(`"${path}" (EN) contains no forbidden phrase`, () => {
      const enVal = (enByPath.get(path) ?? "").toLowerCase();
      for (const { term, reason } of FORBIDDEN_EN_WARNING_TERMS) {
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        expect(re.test(enVal), `${path}: forbidden "${term}". ${reason}`).toBe(false);
      }
    });
  }
});

describe("warning safeguard: English warning not clause-dropped (length floor)", () => {
  it("has a length floor configured", () => {
    expect(WARNING_LENGTH_RATIO_MIN).toBeGreaterThan(0);
  });

  for (const path of warningPaths) {
    it(`"${path}" (EN) is not drastically shorter than ID`, () => {
      if (WARNING_LENGTH_EXCEPTIONS.has(path)) return; // explicitly allowed short
      const idVal = idLeaves.find((l) => l.path === path)?.value ?? "";
      const enVal = enByPath.get(path) ?? "";
      const ratio = idVal.length > 0 ? enVal.length / idVal.length : 1;
      expect(
        ratio >= WARNING_LENGTH_RATIO_MIN,
        `${path}: EN is ${(ratio * 100).toFixed(0)}% of ID length (< ${WARNING_LENGTH_RATIO_MIN * 100}%) — a clause may have been dropped. Lengthen the sentence, or add it to WARNING_LENGTH_EXCEPTIONS with a reason.`,
      ).toBe(true);
    });
  }
});
