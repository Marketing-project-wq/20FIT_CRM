import { describe, it, expect } from "vitest";
import {
  purposePermittedForBasis,
  isConsentBasis,
  isConsentPurpose,
  BASIS_ALLOWED_PURPOSES,
  LEGACY_IMPORT_ALLOWS_MARKETING,
} from "./consent-policy";

describe("consent basis → purpose policy (Sprint 3P)", () => {
  it("explicit_opt_in permits both marketing and transactional", () => {
    expect(purposePermittedForBasis("explicit_opt_in", "marketing")).toBe(true);
    expect(purposePermittedForBasis("explicit_opt_in", "transactional")).toBe(true);
  });

  it("legacy_import_unverified permits transactional", () => {
    expect(purposePermittedForBasis("legacy_import_unverified", "transactional")).toBe(true);
  });

  it("legacy_import_unverified marketing tracks the single legal flag", () => {
    // This is the one open legal decision. The test asserts the map follows the flag,
    // so if someone flips the flag the behaviour is exactly what the map says.
    expect(purposePermittedForBasis("legacy_import_unverified", "marketing")).toBe(
      LEGACY_IMPORT_ALLOWS_MARKETING,
    );
    // Ships closed until legal records the decision.
    expect(LEGACY_IMPORT_ALLOWS_MARKETING).toBe(false);
    expect(BASIS_ALLOWED_PURPOSES.legacy_import_unverified).not.toContain("marketing");
  });

  it("fails closed on unknown basis/purpose (K-03 discipline)", () => {
    expect(purposePermittedForBasis("legitimate_interest", "marketing")).toBe(false);
    expect(purposePermittedForBasis("legacy_import_unverified", "profiling")).toBe(false);
    expect(purposePermittedForBasis(null, null)).toBe(false);
    expect(purposePermittedForBasis(undefined, "marketing")).toBe(false);
  });

  it("type guards accept only the migration-3 vocabulary", () => {
    expect(isConsentBasis("explicit_opt_in")).toBe(true);
    expect(isConsentBasis("legitimate_interest")).toBe(false);
    expect(isConsentPurpose("marketing")).toBe(true);
    expect(isConsentPurpose("service")).toBe(false);
  });
});
