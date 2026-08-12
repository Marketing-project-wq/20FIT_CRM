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
    // This is the one legal decision. The test asserts the map follows the flag, so the
    // behaviour is always exactly what the map says.
    expect(purposePermittedForBasis("legacy_import_unverified", "marketing")).toBe(
      LEGACY_IMPORT_ALLOWS_MARKETING,
    );
    // Flipped to true on 2026-08-12 — the product owner's on-the-record decision to run
    // Migrasi 11 (backfill), which writes marketing consent under a legacy basis
    // (docs/SIGNOFF-legal-consent.md). Legacy now permits BOTH purposes.
    expect(LEGACY_IMPORT_ALLOWS_MARKETING).toBe(true);
    expect(BASIS_ALLOWED_PURPOSES.legacy_import_unverified).toContain("marketing");
    expect(BASIS_ALLOWED_PURPOSES.legacy_import_unverified).toContain("transactional");
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
