import { describe, it, expect } from "vitest";
import {
  extractVariables,
  validateTemplateVariables,
  renderTemplate,
  previewTemplate,
  TEMPLATE_PREVIEW_SAMPLE,
} from "./template";

describe("template — variable extraction", () => {
  it("finds distinct variables in first-seen order, case-insensitive, once each", () => {
    expect(extractVariables("Hi {{first_name}}, {{FIRST_NAME}} in {{city}}. Bye {{first_name}}.")).toEqual([
      "first_name",
      "city",
    ]);
  });
  it("tolerates inner whitespace", () => {
    expect(extractVariables("{{ full_name }}")).toEqual(["full_name"]);
  });
  it("returns nothing for plain text", () => {
    expect(extractVariables("no variables here")).toEqual([]);
  });
});

describe("template — validation rejects unknown variables at SAVE (never at send)", () => {
  it("accepts a body using only the closed vocabulary", () => {
    const v = validateTemplateVariables("Hai {{first_name}} di {{city}} — {{unsubscribe_url}}");
    expect(v.ok).toBe(true);
    expect(v.unknown).toEqual([]);
    expect(v.used).toEqual(["first_name", "city", "unsubscribe_url"]);
  });
  it("rejects an unknown variable and names it", () => {
    const v = validateTemplateVariables("Hai {{first_name}}, saldo {{fitpoint_balance}}");
    expect(v.ok).toBe(false);
    expect(v.unknown).toEqual(["fitpoint_balance"]);
  });
  it("validates subject AND body together (email)", () => {
    const v = validateTemplateVariables("Promo untuk {{nickname}}", "Halo {{first_name}}");
    expect(v.ok).toBe(false);
    expect(v.unknown).toEqual(["nickname"]);
  });
  it("ignores null/undefined parts", () => {
    expect(validateTemplateVariables(null, "Halo {{full_name}}", undefined).ok).toBe(true);
  });
});

describe("template — rendering", () => {
  it("substitutes known variables", () => {
    expect(renderTemplate("Halo {{first_name}} di {{city}}", { first_name: "Budi", city: "Bandung" })).toBe(
      "Halo Budi di Bandung",
    );
  });
  it("renders a missing value as empty string, NEVER as raw {{syntax}}", () => {
    expect(renderTemplate("Halo {{first_name}}", {})).toBe("Halo ");
    expect(renderTemplate("Halo {{first_name}}", {})).not.toContain("{{");
  });
  it("never leaves an out-of-vocabulary token as literal syntax", () => {
    expect(renderTemplate("x {{unknown_thing}} y", {})).toBe("x  y");
  });
  it("preview uses fictional sample data, not real customer data", () => {
    const out = previewTemplate("Halo {{full_name}} di {{city}}");
    expect(out).toBe(`Halo ${TEMPLATE_PREVIEW_SAMPLE.full_name} di ${TEMPLATE_PREVIEW_SAMPLE.city}`);
    expect(out).toContain("Budi Santoso");
  });
});
