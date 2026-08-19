import { describe, it, expect } from "vitest";
import {
  prepareSearch,
  classifyResultCount,
  isSearchKind,
  detectSearchKind,
  NAME_MIN_LEN,
  SEARCH_MAX_RESULTS,
} from "./search";

describe("isSearchKind", () => {
  it("accepts only name/phone/email", () => {
    expect(isSearchKind("name")).toBe(true);
    expect(isSearchKind("phone")).toBe(true);
    expect(isSearchKind("email")).toBe(true);
    expect(isSearchKind("tags")).toBe(false);
    expect(isSearchKind(null)).toBe(false);
  });
});

describe("detectSearchKind — one box, kind from shape", () => {
  it("anything with @ is email (even mixed case, even partial)", () => {
    expect(detectSearchKind("Foo@Bar.com")).toBe("email");
    expect(detectSearchKind("someone@")).toBe("email");
    expect(detectSearchKind("  a@b  ")).toBe("email");
  });

  it("all-digits after stripping separators is phone", () => {
    expect(detectSearchKind("08123456789")).toBe("phone");
    expect(detectSearchKind("+62 812-3456-789")).toBe("phone");
    expect(detectSearchKind("(0812) 3456.789")).toBe("phone");
    expect(detectSearchKind("62812345678")).toBe("phone");
  });

  it("a name with digits keeps its letters → name, not phone", () => {
    expect(detectSearchKind("Agent 007")).toBe("name");
    expect(detectSearchKind("Budi 2")).toBe("name");
  });

  it("plain names are name", () => {
    expect(detectSearchKind("Sri Wahyuni")).toBe("name");
    expect(detectSearchKind("Ali")).toBe("name");
  });

  it("edge: a lone '+' has no digits → name (not phone)", () => {
    expect(detectSearchKind("+")).toBe("name");
    expect(detectSearchKind("  +  ")).toBe("name");
  });

  it("edge: empty / blank → name (neutral default; prepareSearch rejects it)", () => {
    expect(detectSearchKind("")).toBe("name");
    expect(detectSearchKind("   ")).toBe("name");
    expect(detectSearchKind(null)).toBe("name");
    expect(detectSearchKind(undefined)).toBe("name");
  });

  it("every detected kind is a valid SearchKind", () => {
    for (const q of ["a@b.com", "0812", "Sri", "+", ""]) {
      expect(isSearchKind(detectSearchKind(q))).toBe(true);
    }
  });
});

describe("prepareSearch — name (happy path)", () => {
  it("accepts a normal name of >= min length, trimmed", () => {
    expect(prepareSearch("name", "  Budi ")).toEqual({ ok: true, kind: "name", term: "Budi" });
  });
  it("accepts exactly the minimum length", () => {
    expect(prepareSearch("name", "Ali")).toEqual({ ok: true, kind: "name", term: "Ali" });
  });
});

describe("prepareSearch — name (abuse / boundary)", () => {
  it("rejects shorter than the minimum (one letter can't pull half the pool)", () => {
    const r = prepareSearch("name", "Ab");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(String(NAME_MIN_LEN));
  });
  it("rejects empty / whitespace", () => {
    expect(prepareSearch("name", "   ").ok).toBe(false);
    expect(prepareSearch("name", null).ok).toBe(false);
  });
  it("rejects wildcard characters used to harvest", () => {
    expect(prepareSearch("name", "a%").ok).toBe(false);
    expect(prepareSearch("name", "a_b").ok).toBe(false);
  });
  it("rejects an all-digits query on name (that's a phone in the wrong box)", () => {
    const r = prepareSearch("name", "628123456789");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/[Tt]elepon/);
  });
});

describe("prepareSearch — phone (exact, normalized)", () => {
  it("normalizes 0812… to the 62 canon", () => {
    expect(prepareSearch("phone", "0812-3456-789")).toEqual({
      ok: true,
      kind: "phone",
      term: "628123456789",
    });
  });
  it("normalizes +62… to the same canon (all forms find the same person)", () => {
    expect(prepareSearch("phone", "+62 812 3456 789")).toEqual({
      ok: true,
      kind: "phone",
      term: "628123456789",
    });
    expect(prepareSearch("phone", "628123456789")).toEqual({
      ok: true,
      kind: "phone",
      term: "628123456789",
    });
  });
  it("rejects an unrecognizable number (never searches raw)", () => {
    expect(prepareSearch("phone", "not-a-phone").ok).toBe(false);
    expect(prepareSearch("phone", "").ok).toBe(false);
  });
});

describe("prepareSearch — email (exact, normalized)", () => {
  it("lowercases + trims", () => {
    expect(prepareSearch("email", "  John.Doe@Example.COM ")).toEqual({
      ok: true,
      kind: "email",
      term: "john.doe@example.com",
    });
  });
  it("rejects a string with no @", () => {
    expect(prepareSearch("email", "nodomain").ok).toBe(false);
  });
});

describe("classifyResultCount", () => {
  it("0 fetched -> empty", () => {
    expect(classifyResultCount(0)).toBe("empty");
  });
  it("within the cap -> ok", () => {
    expect(classifyResultCount(1)).toBe("ok");
    expect(classifyResultCount(SEARCH_MAX_RESULTS)).toBe("ok");
  });
  it("cap+1 (the probe row) -> too_many, not a truncated page", () => {
    expect(classifyResultCount(SEARCH_MAX_RESULTS + 1)).toBe("too_many");
  });
  it("respects a custom cap", () => {
    expect(classifyResultCount(3, 2)).toBe("too_many");
    expect(classifyResultCount(2, 2)).toBe("ok");
  });
});
