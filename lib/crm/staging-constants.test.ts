import { describe, it, expect } from "vitest";
import {
  parseStagingDob,
  ageFromIso,
  isParticipation,
  isRfmValue,
  programByKey,
  STAGING_PROGRAMS,
  STAGING_FORBIDDEN_COLUMNS,
  STAGING_COLUMNS,
} from "./staging-constants";

// A fixed "today" so the age/plausibility tests are deterministic (no Date.now()).
const TODAY = new Date(Date.UTC(2026, 7, 12)); // 2026-08-12

describe("parseStagingDob", () => {
  it("parses a clean unambiguous ISO date (day > 12 pins the order)", () => {
    const r = parseStagingDob("1989-04-27", TODAY);
    expect(r.status).toBe("parsed");
    expect(r.iso).toBe("1989-04-27");
    expect(r.month).toBe(4);
    expect(r.day).toBe(27);
    expect(r.ambiguousDayMonth).toBe(false);
    expect(r.swapped).toBe(false);
    expect(r.plausibility).toBe("ok");
  });

  it("flags day/month ambiguity when BOTH fields are ≤ 12 (cannot be sure, do not guess)", () => {
    const r = parseStagingDob("1990-05-07", TODAY);
    expect(r.status).toBe("parsed");
    expect(r.ambiguousDayMonth).toBe(true);
    expect(r.swapped).toBe(false);
    // The stored order is kept (month=05, day=07) — flagged, not silently reordered.
    expect(r.iso).toBe("1990-05-07");
  });

  it("reads a day-first value back correctly and flags it swapped (month field > 12)", () => {
    const r = parseStagingDob("1989-27-04", TODAY);
    expect(r.status).toBe("parsed");
    expect(r.swapped).toBe(true);
    expect(r.month).toBe(4);
    expect(r.day).toBe(27);
    expect(r.iso).toBe("1989-04-27");
  });

  it("treats empty / null / blank as empty (no DOB), never unparseable", () => {
    expect(parseStagingDob(null).status).toBe("empty");
    expect(parseStagingDob(undefined).status).toBe("empty");
    expect(parseStagingDob("   ").status).toBe("empty");
  });

  it("rejects non-ISO shapes as unparseable (flag, not a silent drop)", () => {
    for (const bad of ["07/04/1989", "1989", "1989-4-7", "hello", "2000-13-40"]) {
      expect(parseStagingDob(bad, TODAY).status).toBe("unparseable");
    }
  });

  it("rejects an impossible calendar date (31 Feb) as unparseable", () => {
    expect(parseStagingDob("1990-02-31", TODAY).status).toBe("unparseable");
  });

  it("still PARSES an implausible-but-real date, flagging plausibility (year mustahil)", () => {
    const tooOld = parseStagingDob("1898-06-15", TODAY);
    expect(tooOld.status).toBe("parsed");
    expect(tooOld.plausibility).toBe("too_old");

    const future = parseStagingDob("2027-01-01", TODAY);
    expect(future.status).toBe("parsed");
    expect(future.plausibility).toBe("future");

    const tooYoung = parseStagingDob("2020-06-15", TODAY);
    expect(tooYoung.status).toBe("parsed");
    expect(tooYoung.plausibility).toBe("too_young");
  });

  it("leaves plausibility null when no reference date is supplied", () => {
    expect(parseStagingDob("1989-04-27").plausibility).toBeNull();
  });
});

describe("ageFromIso", () => {
  it("computes whole-year age with birthday adjustment", () => {
    expect(ageFromIso("2000-01-01", TODAY)).toBe(26); // birthday passed
    expect(ageFromIso("2000-12-31", TODAY)).toBe(25); // birthday not yet
    expect(ageFromIso("2026-08-12", TODAY)).toBe(0); // born today
  });
  it("returns null for unparseable / impossible", () => {
    expect(ageFromIso(null, TODAY)).toBeNull();
    expect(ageFromIso("1990-02-31", TODAY)).toBeNull();
  });
});

describe("isParticipation (- vs NULL)", () => {
  it("true only for a real value; `-` and NULL are both non-participation", () => {
    expect(isParticipation("Fitco User")).toBe(true);
    expect(isParticipation("Padel rebel")).toBe(true);
    expect(isParticipation("-")).toBe(false); // explicitly not in the program
    expect(isParticipation(null)).toBe(false); // no data
    expect(isParticipation("")).toBe(false);
    expect(isParticipation("  -  ")).toBe(false);
  });
});

describe("RFM values", () => {
  it("accepts the four stored buckets incl. the `Campion user` misspelling, kept verbatim", () => {
    for (const v of ["Campion user", "Loyal user", "New User", "Potensial user"]) {
      expect(isRfmValue(v)).toBe(true);
    }
    expect(isRfmValue("Champion user")).toBe(false); // not stored — do not "fix" it
    expect(isRfmValue("-")).toBe(false); // absence, not a bucket
    expect(isRfmValue(null)).toBe(false);
  });
});

describe("program registry", () => {
  it("resolves by key and marks the clinic-patient columns clinical", () => {
    expect(programByKey("fitco_user")?.clinical).toBe(false);
    expect(programByKey("clinic_2024_2025")?.clinical).toBe(true);
    expect(programByKey("clinic_2025_2026")?.clinical).toBe(true);
    expect(programByKey("nope")).toBeUndefined();
  });
  it("no displayed/queried column is a forbidden identity column (mini-export guard)", () => {
    const cols = [
      ...Object.values(STAGING_COLUMNS).filter((c) => c !== STAGING_COLUMNS.email),
      ...STAGING_PROGRAMS.map((p) => p.column),
    ];
    for (const c of cols) expect(STAGING_FORBIDDEN_COLUMNS.has(c)).toBe(false);
  });
});
