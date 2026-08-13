import { describe, it, expect } from "vitest";
import { id } from "./messages/id";
import { en } from "./messages/en";
import { formatCount, formatPct, formatDate } from "./format";

/** Flatten a nested string dictionary to sorted dotted keys, so key sets can be compared exactly. */
function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...flattenKeys(v as Record<string, unknown>, key));
    else out.push(key);
  }
  return out.sort();
}

describe("dictionary key parity (bidirectional — a missing key in EITHER language fails)", () => {
  const idKeys = flattenKeys(id);
  const enKeys = flattenKeys(en);

  it("English has every Indonesian key (none missing in EN)", () => {
    const missingInEn = idKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  it("Indonesian has every English key (none extra in EN)", () => {
    const missingInId = enKeys.filter((k) => !idKeys.includes(k));
    expect(missingInId).toEqual([]);
  });

  it("both dictionaries have identical key sets", () => {
    expect(enKeys).toEqual(idKeys);
  });

  it("no leaf value is empty in either language", () => {
    for (const dict of [id, en]) {
      const stack: unknown[] = [dict];
      while (stack.length) {
        const cur = stack.pop();
        if (cur && typeof cur === "object") stack.push(...Object.values(cur));
        else expect(typeof cur === "string" && cur.length > 0).toBe(true);
      }
    }
  });
});

describe("number/date formatting differs by language (the biggest i18n danger)", () => {
  it("groups thousands per locale: 82.253 (id) vs 82,253 (en)", () => {
    expect(formatCount(82253, "id")).toBe("82.253");
    expect(formatCount(82253, "en")).toBe("82,253");
  });

  it("percent uses the locale decimal separator: 7,03% (id) vs 7.03% (en)", () => {
    expect(formatPct(7.03, "id")).toBe("7,03%");
    expect(formatPct(7.03, "en")).toBe("7.03%");
    expect(formatPct(1.35, "id")).toBe("1,35%");
    expect(formatPct(1.35, "en")).toBe("1.35%");
  });

  it("dates render in the language", () => {
    // 2026-04-20 in Asia/Jakarta.
    expect(formatDate("2026-04-20T00:00:00+07:00", "id")).toContain("April");
    expect(formatDate("2026-04-20T00:00:00+07:00", "en")).toContain("April");
    expect(formatDate(null, "id")).toBe("—");
  });
});
