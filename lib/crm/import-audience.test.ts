import { describe, it, expect } from "vitest";
import { safeCode } from "./safe-code";
import {
  guessColumnMapping,
  normalizeMappedRow,
  planImport,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportKeys,
  importFailureMessage,
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

// ── T-49: a failed import names its class, and no prose ever reaches a code field ─────────────
describe("importFailureMessage — the class, and whether retrying can help", () => {
  it("names the missing RPC and says retrying will not help", () => {
    for (const code of ["PGRST202", "42883"]) {
      const m = importFailureMessage(code);
      expect(m).toContain(code);
      expect(m).toMatch(/tidak akan berhasil/);
    }
  });

  it("names a rejected value as a configuration defect, not the operator's file", () => {
    const m = importFailureMessage("23514");
    expect(m).toContain("23514");
    expect(m).toMatch(/bukan masalah berkas Anda/);
    expect(m).toMatch(/tidak akan berhasil/);
  });

  it("says 'try again' ONLY where trying again can actually work", () => {
    // A timeout is the one class where a retry (smaller file) is real advice.
    expect(importFailureMessage("57014")).toMatch(/Coba lagi/);
    // Everywhere else it must not promise that.
    for (const code of ["PGRST202", "42883", "23514", "23505", "23503", "42501", null]) {
      expect(importFailureMessage(code), `code ${code}`).not.toMatch(/Coba lagi/);
    }
  });

  it("is honest when the database gave no code at all", () => {
    expect(importFailureMessage(null)).toMatch(/tidak memberi kode/);
  });

  it("still names an unknown code rather than swallowing it", () => {
    expect(importFailureMessage("40001")).toContain("40001");
  });
});

describe("safeCode — the shared PII-free shape guard (used by the import route and send path)", () => {
  it("accepts real codes", () => {
    expect(safeCode("23514")).toBe("23514");
    expect(safeCode("PGRST202")).toBe("PGRST202");
    expect(safeCode("ECONNRESET")).toBe("ECONNRESET");
    expect(safeCode(429)).toBe("429");
  });

  it("drops Postgres prose WHOLE — a truncated leak is still a leak", () => {
    // The exact shape that made the old `e.message.slice(0, 60)` a PII leak.
    expect(safeCode('Key (email_normalized)=(orang@contoh.co.id) already exists')).toBeNull();
    expect(safeCode('duplicate key value violates unique constraint "idx_master"')).toBeNull();
    expect(safeCode("new row violates check constraint")).toBeNull();
  });

  it("drops anything that is not code-shaped", () => {
    expect(safeCode(null)).toBeNull();
    expect(safeCode(undefined)).toBeNull();
    expect(safeCode({ code: "23514" })).toBeNull();
    expect(safeCode("x".repeat(41))).toBeNull();
    expect(safeCode("")).toBeNull();
  });
});
