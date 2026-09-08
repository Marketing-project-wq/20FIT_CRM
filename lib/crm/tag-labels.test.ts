import { describe, it, expect } from "vitest";
import { ambiguousTagValueLabels, disambiguateTagLabel, tagValueLabel } from "./tags";

/**
 * T-72: a value-label produced by tags in more than one namespace ("Hybrid Race" from BOTH
 * produk:hybrid-race and peran:hybrid-race) is ambiguous on a chip that has no namespace header.
 * These lock the disambiguation: prefix the namespace ONLY where the value clashes, plain otherwise.
 */

const VOCAB = [
  "produk:hybrid-race",
  "produk:jakarta-hybrid-race",
  "peran:hybrid-race",
  "peran:spectator",
  "event:sportfest-2-2026-02",
];

describe("ambiguousTagValueLabels", () => {
  it("flags a value-label shared across namespaces, not one that is unique", () => {
    const amb = ambiguousTagValueLabels(VOCAB, "id");
    expect(amb.has("hybrid race")).toBe(true); // produk + peran
    expect(amb.has("jakarta hybrid race")).toBe(false); // only produk
    expect(amb.has("spectator")).toBe(false);
    expect(amb.has("sportfest 2 2026 02")).toBe(false);
  });
});

describe("disambiguateTagLabel", () => {
  const amb = ambiguousTagValueLabels(VOCAB, "id");
  it("prefixes the namespace ONLY when the value is ambiguous", () => {
    expect(disambiguateTagLabel("produk:hybrid-race", "id", amb)).toBe("Produk · hybrid race");
    expect(disambiguateTagLabel("peran:hybrid-race", "id", amb)).toBe("Peran · hybrid race");
    // Unambiguous → plain value label, no prefix.
    expect(disambiguateTagLabel("peran:spectator", "id", amb)).toBe(tagValueLabel("peran:spectator", "id"));
    expect(disambiguateTagLabel("produk:jakarta-hybrid-race", "id", amb)).toBe(tagValueLabel("produk:jakarta-hybrid-race", "id"));
  });
  it("without an ambiguity set, always returns the plain value label", () => {
    expect(disambiguateTagLabel("produk:hybrid-race", "id")).toBe("hybrid race");
  });
});
