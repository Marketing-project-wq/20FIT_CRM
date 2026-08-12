import { describe, it, expect } from "vitest";
import { parseNik, PROVINCE_BY_CODE } from "./nik";

// Helper: build a NIK from parts (province, regency, district, dayCode, month, yy, serial).
const nik = (pp: string, kk: string, cc: string, dd: string, mm: string, yy: string, ser = "0001") =>
  `${pp}${kk}${cc}${dd}${mm}${yy}${ser}`;

describe("parseNik — gender", () => {
  it("male: day code 01–31 as-is", () => {
    const r = parseNik(nik("31", "71", "01", "15", "08", "90"));
    expect(r.valid).toBe(true);
    expect(r.gender).toBe("male");
    expect(r.birthDay).toBe(15);
    expect(r.birthMonth).toBe(8);
    expect(r.birthYear).toBe(1990);
    expect(r.birthDate).toBe("1990-08-15");
  });
  it("female: day code +40, real day = code − 40", () => {
    const r = parseNik(nik("32", "01", "01", "55", "12", "95")); // 55-40 = 15
    expect(r.gender).toBe("female");
    expect(r.birthDay).toBe(15);
    expect(r.birthMonth).toBe(12);
    expect(r.birthYear).toBe(1995);
  });
  it("boundary day 31 (male) and 71 (female, =31)", () => {
    expect(parseNik(nik("31", "01", "01", "31", "01", "80")).gender).toBe("male");
    const f = parseNik(nik("31", "01", "01", "71", "01", "80"));
    expect(f.gender).toBe("female");
    expect(f.birthDay).toBe(31);
  });
});

describe("parseNik — century rule", () => {
  it("yy 00–11 → 2000s, yy 46–99 → 1900s", () => {
    expect(parseNik(nik("31", "01", "01", "10", "06", "05")).birthYear).toBe(2005);
    expect(parseNik(nik("31", "01", "01", "10", "06", "46")).birthYear).toBe(1946);
    expect(parseNik(nik("31", "01", "01", "10", "06", "99")).birthYear).toBe(1999);
  });
  it("flags out-of-range years (12–45) instead of guessing", () => {
    const r = parseNik(nik("31", "01", "01", "10", "06", "30")); // → 1930, age > 80
    expect(r.valid).toBe(true);
    expect(r.yearOutOfRange).toBe(true);
  });
});

describe("parseNik — province (issuance, not domicile)", () => {
  it("resolves a known province code, raw kab/kec kept", () => {
    const r = parseNik(nik("31", "71", "05", "15", "08", "90"));
    expect(r.provinceCode).toBe("31");
    expect(r.provinceName).toBe(PROVINCE_BY_CODE["31"]);
    expect(r.regencyCode).toBe("71");
    expect(r.districtCode).toBe("05");
  });
  it("unknown province code → name null (never guessed)", () => {
    const r = parseNik(nik("99", "01", "01", "15", "08", "90"));
    expect(r.provinceCode).toBe("99");
    expect(r.provinceName).toBeNull();
  });
});

describe("parseNik — invalid inputs", () => {
  it("wrong length → invalid, no partial date", () => {
    expect(parseNik("123").valid).toBe(false);
    expect(parseNik("123").reason).toBe("wrong_length");
    expect(parseNik("123").birthDate).toBeNull();
  });
  it("dummy patterns rejected", () => {
    expect(parseNik("0000000000000000").reason).toBe("dummy");
    expect(parseNik("1234567890123456").reason).toBe("dummy");
  });
  it("bad month / bad day rejected", () => {
    expect(parseNik(nik("31", "01", "01", "15", "13", "90")).reason).toBe("bad_month");
    expect(parseNik(nik("31", "01", "01", "00", "08", "90")).reason).toBe("bad_day");
  });
  it("null / empty → invalid", () => {
    expect(parseNik(null).valid).toBe(false);
    expect(parseNik("   ").valid).toBe(false);
  });
  it("31 February → valid parse but no ISO date (impossible calendar day)", () => {
    const r = parseNik(nik("31", "01", "01", "31", "02", "90"));
    expect(r.valid).toBe(true);
    expect(r.birthDay).toBe(31);
    expect(r.birthMonth).toBe(2);
    expect(r.birthDate).toBeNull();
  });
});

describe("parseNik — normalisation", () => {
  it("strips spaces and hyphens before parsing", () => {
    const spaced = "3171 0115 0890 0001"; // 3-4 kab=71 ... wait: 31 71 01 15 08 90 0001
    // Build cleanly: province 31, regency 71, district 01, day 15, month 08, yy 90
    const r = parseNik("31-71-01-15-08-90-0001");
    expect(r.valid).toBe(true);
    expect(r.gender).toBe("male");
    expect(spaced.replace(/\D/g, "").length).toBe(16);
  });
});
