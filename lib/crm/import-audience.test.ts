import { describe, it, expect } from "vitest";
import {
  guessColumnMapping,
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

  it("skips a row matching an existing person by email OR phone", () => {
    const keys: ImportKeys = { ...noKeys, existingEmails: new Set(["a@x.com"]), existingPhones: new Set(["62822"]) };
    const rows = [
      { name: "A", email: "a@x.com", phone: "" }, // email exists
      { name: "B", email: "b@x.com", phone: "0822" }, // phone 62822 exists
      { name: "C", email: "c@x.com", phone: "0833" }, // new
    ];
    const p = planImport(rows, mapping, keys);
    expect(p.summary.duplicatesExisting).toBe(2);
    expect(p.summary.netInsert).toBe(1);
    expect(p.insertRows[0].emailNormalized).toBe("c@x.com");
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
