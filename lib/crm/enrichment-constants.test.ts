import { describe, it, expect } from "vitest";
import {
  HYROX_SAFE_COLUMNS,
  HYROX_SENSITIVE_COLUMNS,
  HYROX_FORBIDDEN_COLUMNS,
  MY20FIT_PROFILE_SAFE_COLUMNS,
  MY20FIT_PROFILE_FORBIDDEN_COLUMNS,
  MY20FIT_ACTIVITY_SAFE_COLUMNS,
  maskSensitive,
  MASKED_PLACEHOLDER,
} from "./enrichment-constants";

describe("enrichment safe-column guards (Sprint 3R)", () => {
  it("Hyrox safe list never contains a sensitive or forbidden column", () => {
    const safe = new Set<string>(HYROX_SAFE_COLUMNS);
    for (const s of HYROX_SENSITIVE_COLUMNS) expect(safe.has(s)).toBe(false);
    for (const f of HYROX_FORBIDDEN_COLUMNS) expect(safe.has(f)).toBe(false);
  });

  it("Hyrox sensitive list is exactly NIK/DOB/blood/emergency", () => {
    expect([...HYROX_SENSITIVE_COLUMNS].sort()).toEqual(
      ["gol_darah", "kontak_darurat", "nik", "no_kontak_darurat", "tgl_lahir"].sort(),
    );
  });

  it("my20fit_profile safe list excludes ALL health/body/cycle columns", () => {
    const safe = new Set<string>(MY20FIT_PROFILE_SAFE_COLUMNS);
    for (const f of MY20FIT_PROFILE_FORBIDDEN_COLUMNS) expect(safe.has(f)).toBe(false);
    // Belt-and-braces: the specific health columns must be absent by name.
    for (const health of ["health_conditions", "last_period_date", "height_cm", "weight_kg", "age"]) {
      expect(safe.has(health)).toBe(false);
    }
  });

  it("activity safe list carries recency but no identifier", () => {
    expect([...MY20FIT_ACTIVITY_SAFE_COLUMNS]).toContain("last_active_at");
    expect([...MY20FIT_ACTIVITY_SAFE_COLUMNS]).toContain("ping_count");
    expect([...MY20FIT_ACTIVITY_SAFE_COLUMNS]).not.toContain("email");
    expect([...MY20FIT_ACTIVITY_SAFE_COLUMNS]).not.toContain("auth_user_id");
  });
});

describe("maskSensitive", () => {
  it("replaces any real value with the placeholder (no partial leak)", () => {
    expect(maskSensitive("3201234567890001")).toBe(MASKED_PLACEHOLDER);
    expect(maskSensitive("O+")).toBe(MASKED_PLACEHOLDER);
    // Never reveals a suffix of a national ID.
    expect(maskSensitive("3201234567890001")).not.toContain("0001");
  });
  it("keeps null/blank as null so the UI can say 'not recorded'", () => {
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive("   ")).toBeNull();
    expect(maskSensitive(undefined)).toBeNull();
  });
});
