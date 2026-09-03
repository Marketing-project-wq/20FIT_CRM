import { describe, it, expect } from "vitest";
import {
  guessColumnMapping,
  isExcelBrokenPhone,
  normalizeMappedRow,
  planImport,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportKeys,
} from "./import-audience";

const noKeys: ImportKeys = {
  existingEmails: new Set(),
  existingPhones: new Set(),
  suppressedEmails: new Set(),
  suppressedPhones: new Set(),
};

describe("guessColumnMapping", () => {
  it("guesses common Indonesian + English headers, each field once", () => {
    const m = guessColumnMapping(["Nama Lengkap", "Email", "No HP", "Kota", "Catatan"]);
    expect(m).toEqual({
      "Nama Lengkap": "full_name",
      Email: "email",
      "No HP": "phone",
      Kota: "city",
      Catatan: "ignore",
    });
  });
  it("does not map a second header to an already-used field", () => {
    const m = guessColumnMapping(["email", "email cadangan"]);
    expect(m["email"]).toBe("email");
    expect(m["email cadangan"]).toBe("ignore");
  });
});

describe("normalizeMappedRow", () => {
  const mapping: ColumnMapping = { Nama: "full_name", Surel: "email", HP: "phone", Kota: "city", X: "ignore" };
  it("normalizes email + phone through the canon", () => {
    const n = normalizeMappedRow({ Nama: "Budi", Surel: "  BUDI@Mail.COM ", HP: "0812-3456-7890", Kota: "Jakarta", X: "z" }, mapping);
    expect(n.fullName).toBe("Budi");
    expect(n.email).toBe("BUDI@Mail.COM"); // raw kept as typed (trimmed)
    expect(n.emailNormalized).toBe("budi@mail.com");
    expect(n.phoneNormalized).toBe("6281234567890"); // 62… no +
    expect(n.city).toBe("Jakarta");
  });
  it("nulls an unusable email/phone", () => {
    const n = normalizeMappedRow({ Nama: "X", Surel: "not-an-email", HP: "abc", Kota: "", X: "" }, mapping);
    expect(n.emailNormalized).toBeNull();
    expect(n.phoneNormalized).toBeNull();
  });
  it("flags an Excel-mangled phone (scientific notation), drops the phone, keeps a valid email", () => {
    const n = normalizeMappedRow({ Nama: "X", Surel: "x@x.com", HP: "6,28129E+12", Kota: "", X: "" }, mapping);
    expect(n.phoneExcelBroken).toBe(true);
    expect(n.phoneNormalized).toBeNull(); // digits are gone — never guessed-fixed
    expect(n.emailNormalized).toBe("x@x.com"); // the row can still import on its email
  });
  it("does not flag a normal phone", () => {
    const n = normalizeMappedRow({ Nama: "X", Surel: "x@x.com", HP: "0812-3456-7890", Kota: "", X: "" }, mapping);
    expect(n.phoneExcelBroken).toBe(false);
    expect(n.phoneNormalized).toBe("6281234567890");
  });
});

describe("isExcelBrokenPhone", () => {
  it("detects the shapes Excel produces (comma or dot decimal, upper/lower E, +)", () => {
    for (const raw of ["6,28129E+12", "6.28129E+12", "6e+12", "6E12", "1,5e5", " 6,28129E+12 "]) {
      expect(isExcelBrokenPhone(raw)).toBe(true);
    }
  });
  it("does not flag real phones or empty/garbage", () => {
    for (const raw of ["6281234567890", "0812-3456-7890", "+62 812 3456", "", null, undefined, "abc", "E+12"]) {
      expect(isExcelBrokenPhone(raw)).toBe(false);
    }
  });
});

describe("planImport", () => {
  const mapping: ColumnMapping = { name: "full_name", email: "email", phone: "phone" };

  it("counts net-new inserts and skips invalids", () => {
    const rows = [
      { name: "A", email: "a@x.com", phone: "0811111" },
      { name: "B", email: "not-email", phone: "" }, // invalid
      { name: "C", email: "c@x.com", phone: "" },
    ];
    const p = planImport(rows, mapping, noKeys);
    expect(p.summary.read).toBe(3);
    expect(p.summary.invalid).toBe(1);
    expect(p.summary.netInsert).toBe(2);
    expect(p.summary.netContactable).toBe(2);
    expect(p.insertRows.map((r) => r.emailNormalized)).toEqual(["a@x.com", "c@x.com"]);
  });

  it("EMAIL-PRIMARY dedup (K-55): skips an email match, but INSERTS a phone-only match with a shared-phone flag", () => {
    const keys: ImportKeys = { ...noKeys, existingEmails: new Set(["a@x.com"]), existingPhones: new Set(["62822"]) };
    const rows = [
      { name: "A", email: "a@x.com", phone: "" }, // email exists → SKIP (unambiguous same identity)
      { name: "B", email: "b@x.com", phone: "0822" }, // NEW email, phone 62822 exists → INSERT + shared-phone flag
      { name: "C", email: "c@x.com", phone: "0833" }, // new → insert
    ];
    const p = planImport(rows, mapping, keys);
    expect(p.summary.duplicatesEmail).toBe(1); // only A
    expect(p.summary.sharedPhone).toBe(1); // B — inserted, but its phone collides with an existing contact
    expect(p.summary.netInsert).toBe(2); // B and C both inserted — a shared number never drops a distinct person
    expect(p.insertRows.map((r) => r.emailNormalized)).toEqual(["b@x.com", "c@x.com"]);
    expect(p.outcomes.find((o) => o.email === "b@x.com")?.status).toBe("insert_shared_phone");
    expect(p.outcomes.find((o) => o.email === "a@x.com")?.status).toBe("skip_duplicate_email");
  });

  it("(d) SKIPS a shared phone that is currently suppressed — never creates a contactable identity for a nulled, suppressed number", () => {
    const keys: ImportKeys = {
      ...noKeys,
      existingPhones: new Set(["62822"]),
      suppressedPhones: new Set(["62822"]),
    };
    const rows = [{ name: "B", email: "b@x.com", phone: "0822" }]; // new email; phone both shared AND suppressed
    const p = planImport(rows, mapping, keys);
    expect(p.summary.sharedPhoneSuppressed).toBe(1);
    expect(p.summary.netInsert).toBe(0); // NOT imported — the row is skipped, closing the send-time gap
    expect(p.summary.sharedPhone).toBe(0); // it never reached the insert path
    expect(p.summary.suppressed).toBe(0);
    expect(p.insertRows).toHaveLength(0); // LOCKSTEP: the carved-out row is absent from what execute writes
    expect(p.outcomes[0].status).toBe("skip_shared_phone_suppressed");
  });

  it("(d) does NOT over-skip: a suppressed phone that is NOT shared is imported (phone written → suppression still catches it at send)", () => {
    const keys: ImportKeys = { ...noKeys, suppressedPhones: new Set(["62822"]) }; // suppressed but NOT in existingPhones
    const rows = [{ name: "B", email: "b@x.com", phone: "0822" }];
    const p = planImport(rows, mapping, keys);
    expect(p.summary.sharedPhoneSuppressed).toBe(0); // not shared → carve-out does not fire
    expect(p.summary.netInsert).toBe(1);
    expect(p.summary.suppressed).toBe(1); // inserted-as-suppressed; its phone is written, so send-time filter works
    expect(p.summary.netContactable).toBe(0);
    expect(p.insertRows).toHaveLength(1); // LOCKSTEP: it DOES reach execute (with its phone intact)
    expect(p.outcomes[0].status).toBe("insert_suppressed");
  });

  it("(d) a shared phone that is suppressed BY EMAIL only (phone not suppressed) still imports — email is written intact and matchable", () => {
    const keys: ImportKeys = {
      ...noKeys,
      existingPhones: new Set(["62822"]),
      suppressedEmails: new Set(["b@x.com"]),
    };
    const rows = [{ name: "B", email: "b@x.com", phone: "0822" }]; // phone shared but NOT suppressed; email suppressed
    const p = planImport(rows, mapping, keys);
    expect(p.summary.sharedPhoneSuppressed).toBe(0);
    expect(p.summary.netInsert).toBe(1);
    expect(p.summary.sharedPhone).toBe(1);
    expect(p.summary.suppressed).toBe(1);
    expect(p.outcomes[0].status).toBe("insert_suppressed");
  });

  it("skips a duplicate email within the same file (case-insensitive)", () => {
    const rows = [
      { name: "A", email: "dup@x.com", phone: "" },
      { name: "A2", email: "DUP@x.com", phone: "" },
    ];
    const p = planImport(rows, mapping, noKeys);
    expect(p.summary.netInsert).toBe(1);
    expect(p.summary.duplicatesInBatch).toBe(1);
  });

  it("still inserts a suppressed net-new person but counts it separately (won't receive)", () => {
    const keys: ImportKeys = { ...noKeys, suppressedEmails: new Set(["stop@x.com"]) };
    const rows = [
      { name: "S", email: "stop@x.com", phone: "" },
      { name: "OK", email: "ok@x.com", phone: "" },
    ];
    const p = planImport(rows, mapping, keys);
    expect(p.summary.netInsert).toBe(2); // both inserted
    expect(p.summary.suppressed).toBe(1); // one is suppressed
    expect(p.summary.netContactable).toBe(1); // only one can actually be sent to
    expect(p.outcomes.find((o) => o.email === "stop@x.com")?.status).toBe("insert_suppressed");
  });

  it("MAX_IMPORT_ROWS is the small Fase-1 cap", () => {
    expect(MAX_IMPORT_ROWS).toBe(20_000);
  });
});
