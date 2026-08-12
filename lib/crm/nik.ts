/**
 * NIK (Nomor Induk Kependudukan) parsing — PURE, client-safe (Sprint 3S TUGAS 6).
 *
 * A 16-digit NIK encodes: PP KK CC · DD MM YY · XXXX
 *   1-2  province code        3-4 kab/kota   5-6 kecamatan
 *   7-8  day of birth (+40 if FEMALE)   9-10 month   11-12 year (2-digit)   13-16 serial
 *
 * This DERIVES gender, birth date, and registration province — three fields that are 0%
 * filled in master_customer. It NEVER writes: derivation happens at display time from the
 * NIK (which itself is a gated sensitive field). Digits 13-16 (serial) carry no profile
 * information and are never surfaced.
 *
 * Region codes: PROVINCE (2-digit, 38 provinces) is stable and embedded below. Kab/kota &
 * kecamatan codes CHANGE with administrative splits (pemekaran) and there is NO Kemendagri
 * reference table in this database — so those codes are shown RAW, never guessed into names.
 * The province is where the KTP was ISSUED, not a current address — labelled accordingly.
 *
 * KNOWN DATA BUG (verified 11 Agu 2026): of 967 parseable NIK with a stored tgl_lahir, 321
 * have the stored day and month SWAPPED vs the NIK (a systematic DD/MM parse bug at import,
 * same class as gmaol.com / T-16). For those, the NIK-derived date is the more trustworthy
 * one — but this module never picks silently; the caller shows both with provenance.
 */

/** Kemendagri 2-digit province codes → names (38 provinces incl. the 2022–2024 Papua splits). */
export const PROVINCE_BY_CODE: Record<string, string> = {
  "11": "Aceh",
  "12": "Sumatera Utara",
  "13": "Sumatera Barat",
  "14": "Riau",
  "15": "Jambi",
  "16": "Sumatera Selatan",
  "17": "Bengkulu",
  "18": "Lampung",
  "19": "Kepulauan Bangka Belitung",
  "21": "Kepulauan Riau",
  "31": "DKI Jakarta",
  "32": "Jawa Barat",
  "33": "Jawa Tengah",
  "34": "DI Yogyakarta",
  "35": "Jawa Timur",
  "36": "Banten",
  "51": "Bali",
  "52": "Nusa Tenggara Barat",
  "53": "Nusa Tenggara Timur",
  "61": "Kalimantan Barat",
  "62": "Kalimantan Tengah",
  "63": "Kalimantan Selatan",
  "64": "Kalimantan Timur",
  "65": "Kalimantan Utara",
  "71": "Sulawesi Utara",
  "72": "Sulawesi Tengah",
  "73": "Sulawesi Selatan",
  "74": "Sulawesi Tenggara",
  "75": "Gorontalo",
  "76": "Sulawesi Barat",
  "81": "Maluku",
  "82": "Maluku Utara",
  "91": "Papua",
  "92": "Papua Barat",
  "93": "Papua Selatan",
  "94": "Papua Tengah",
  "95": "Papua Pegunungan",
  "96": "Papua Barat Daya",
};

/**
 * Century rule for the 2-digit year — stated explicitly, not guessed silently. A fitness
 * customer base is realistically ~15–80 years old (born ~1946–2011 as of 2026). So:
 *   yy 00–11 → 2000–2011   ·   yy 46–99 → 1946–1999
 * Anything in 12–45 would land at 1912–1945 (age 81–114) or 2012–2045 (age 0–14) — both
 * outside the plausible range — so it is FLAGGED (yearOutOfRange), not forced into a guess.
 */
const YEAR_PIVOT = 11;

export type NikGender = "male" | "female";

export interface NikDerived {
  valid: boolean;
  /** Why it could not be parsed (present only when !valid). */
  reason?: "empty" | "wrong_length" | "dummy" | "bad_day" | "bad_month";
  gender: NikGender | null;
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
  /** ISO yyyy-mm-dd when day+month+year are all valid; null otherwise. */
  birthDate: string | null;
  /** True when the derived year fell outside the plausible fitness-age range (still returned). */
  yearOutOfRange: boolean;
  provinceCode: string | null;
  /** Province of KTP ISSUANCE (not current address). Null when the code is unknown. */
  provinceName: string | null;
  /** Raw kab/kota + kecamatan codes — shown as-is (no reference table to resolve them). */
  regencyCode: string | null;
  districtCode: string | null;
}

function invalid(reason: NikDerived["reason"]): NikDerived {
  return {
    valid: false,
    reason,
    gender: null,
    birthDay: null,
    birthMonth: null,
    birthYear: null,
    birthDate: null,
    yearOutOfRange: false,
    provinceCode: null,
    provinceName: null,
    regencyCode: null,
    districtCode: null,
  };
}

const DUMMY = /^(\d)\1{15}$/; // all 16 digits identical

/** Parse a NIK into derived profile fields. Strips non-digits first; requires exactly 16
 *  digits; rejects dummy patterns. Never returns a partial date. */
export function parseNik(raw: string | null | undefined): NikDerived {
  if (raw == null) return invalid("empty");
  const d = String(raw).replace(/\D/g, "");
  if (d === "") return invalid("empty");
  if (d.length !== 16) return invalid("wrong_length");
  if (DUMMY.test(d) || d === "1234567890123456") return invalid("dummy");

  const provinceCode = d.slice(0, 2);
  const regencyCode = d.slice(2, 4);
  const districtCode = d.slice(4, 6);
  const dayCode = parseInt(d.slice(6, 8), 10);
  const month = parseInt(d.slice(8, 10), 10);
  const yy = parseInt(d.slice(10, 12), 10);

  const female = dayCode > 40;
  const birthDay = female ? dayCode - 40 : dayCode;
  if (!(birthDay >= 1 && birthDay <= 31)) return invalid("bad_day");
  if (!(month >= 1 && month <= 12)) return invalid("bad_month");

  const birthYear = yy <= YEAR_PIVOT ? 2000 + yy : 1900 + yy;
  const yearOutOfRange = birthYear < 1946 || birthYear > 2011;

  // ISO date only when the calendar day is real for that month/year (rejects 31 Feb etc.).
  const iso = `${birthYear}-${String(month).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  const realDate =
    dt.getUTCFullYear() === birthYear && dt.getUTCMonth() + 1 === month && dt.getUTCDate() === birthDay;

  return {
    valid: true,
    gender: female ? "female" : "male",
    birthDay,
    birthMonth: month,
    birthYear,
    birthDate: realDate ? iso : null,
    yearOutOfRange,
    provinceCode,
    provinceName: PROVINCE_BY_CODE[provinceCode] ?? null,
    regencyCode,
    districtCode,
  };
}
