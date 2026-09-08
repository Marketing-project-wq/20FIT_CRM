import { describe, it, expect } from "vitest";
import { safeCode } from "./safe-code";
import {
  guessColumnMapping,
  isExcelBrokenPhone,
  normalizeMappedRow,
  planImport,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type ImportKeys,
  importFailureMessage,
  importActionableTotal,
  canRunImport,
} from "./import-audience";

const noKeys: ImportKeys = {
  existingEmails: new Set(),
  taggableEmails: new Set(),
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

  it("EMAIL-PRIMARY dedup (K-57): skips an email match, but INSERTS a phone-only match with a shared-phone flag", () => {
    const keys: ImportKeys = { ...noKeys, existingEmails: new Set(["a@x.com"]), taggableEmails: new Set(["a@x.com"]), existingPhones: new Set(["62822"]) };
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

// ── TUGAS B/E: the tagged population, the two phone figures, and refused tags ─────────────────
describe("planImport — tags (K-58)", () => {
  const mapping: ColumnMapping = { name: "full_name", email: "email", phone: "phone", tags: "tags" };
  const noKeysLocal: ImportKeys = {
    existingEmails: new Set(),
    taggableEmails: new Set(),
    existingPhones: new Set(),
    suppressedEmails: new Set(),
    suppressedPhones: new Set(),
  };

  it("an EMAIL match is TAGGED, not merely skipped — with that row's own tags", () => {
    const p = planImport(
      [{ name: "A", email: "a@x.com", phone: "", tags: "event:sportfest-3-2026-05|tipe:gratis" }],
      mapping,
      { ...noKeysLocal, existingEmails: new Set(["a@x.com"]), taggableEmails: new Set(["a@x.com"]) },
    );
    expect(p.summary.taggedExisting).toBe(1);
    expect(p.tagTargets).toEqual([
      { email: "a@x.com", tags: ["event:sportfest-3-2026-05", "tipe:gratis"] },
    ]);
    expect(p.insertRows).toHaveLength(0);
  });

  // ── T-55 (keputusan pemilik 7 Sep 2026: opsi 1 + 3 bersama) ────────────────────────────────
  it("an email matching ONLY a merged person is skip_merged — not inserted, not tagged", () => {
    const p = planImport(
      [{ name: "A", email: "a@x.com", phone: "", tags: "event:hyrox-sim-half" }],
      mapping,
      // In the pool (so the ingest anti-join will refuse to insert), but every row carrying that
      // email has `merged_into` set (so the ingest `upd` will refuse to tag).
      { ...noKeysLocal, existingEmails: new Set(["a@x.com"]), taggableEmails: new Set() },
    );
    expect(p.summary.skippedMerged).toBe(1);
    expect(p.summary.taggedExisting).toBe(0);
    expect(p.tagTargets).toEqual([]);
    expect(p.insertRows).toHaveLength(0);
    expect(p.outcomes[0].status).toBe("skip_merged");
  });

  it("the dry-run tag count now EQUALS what the write applies, merged rows included", () => {
    // The defect this locks: before T-55 the planner counted a merged person under taggedExisting,
    // the SQL `upd` skipped them, and the report screen simply showed a smaller number. Here two
    // emails exist in the pool; only one is taggable.
    const p = planImport(
      [
        { name: "A", email: "a@x.com", phone: "", tags: "event:hyrox-sim-half" },
        { name: "B", email: "b@x.com", phone: "", tags: "event:hyrox-sim-half" },
      ],
      mapping,
      {
        ...noKeysLocal,
        existingEmails: new Set(["a@x.com", "b@x.com"]),
        taggableEmails: new Set(["a@x.com"]),
      },
    );
    // tagTargets is exactly what is handed to p_tag_rows, and `upd` will match every one of them.
    expect(p.tagTargets).toEqual([{ email: "a@x.com", tags: ["event:hyrox-sim-half"] }]);
    expect(p.summary.taggedExisting).toBe(1);
    expect(p.summary.skippedMerged).toBe(1);
    // Both rows are still reported as already-in-pool; the split is in HOW they were handled.
    expect(p.summary.duplicatesEmail).toBe(2);
  });

  it("a person present on BOTH a merged row and a live row is still tagged", () => {
    // The partial unique index excludes merged rows, so one email can sit on a merged row AND a
    // live one. Taggable wins: the live row is what `upd` will update.
    const p = planImport(
      [{ name: "A", email: "a@x.com", phone: "", tags: "peran:peserta" }],
      mapping,
      { ...noKeysLocal, existingEmails: new Set(["a@x.com"]), taggableEmails: new Set(["a@x.com"]) },
    );
    expect(p.summary.skippedMerged).toBe(0);
    expect(p.summary.taggedExisting).toBe(1);
  });

  it("a PHONE-only match is inserted and the existing phone-owner is NOT tagged (K-57)", () => {
    const p = planImport(
      [{ name: "B", email: "b@x.com", phone: "0822", tags: "event:platarox-2026-07" }],
      mapping,
      { ...noKeysLocal, existingPhones: new Set(["62822"]) },
    );
    expect(p.summary.taggedExisting).toBe(0);
    expect(p.tagTargets).toEqual([]);
    expect(p.insertRows).toHaveLength(1);
    expect(p.insertRows[0].tags).toEqual(["event:platarox-2026-07"]);
  });

  it("the same existing email twice in one file is tagged ONCE", () => {
    const p = planImport(
      [
        { name: "A", email: "a@x.com", phone: "", tags: "event:hyrox-sim-half" },
        { name: "A again", email: "a@x.com", phone: "", tags: "event:hyrox-sim-half" },
      ],
      mapping,
      { ...noKeysLocal, existingEmails: new Set(["a@x.com"]), taggableEmails: new Set(["a@x.com"]) },
    );
    expect(p.summary.taggedExisting).toBe(1);
    expect(p.tagTargets).toHaveLength(1);
    // Both ROWS are still reported as skipped-because-existing; only the PERSON is tagged once.
    expect(p.summary.duplicatesEmail).toBe(2);
  });

  it("sharedPhoneInBatch counts EVERY row of a colliding group, not just the extras", () => {
    // The write nulls the phone on every row sharing a number, so a number used twice costs two
    // phones. Computed from the input — never pinned to a fixed number, since importing per event
    // yields fewer in-file collisions than the combined file.
    const p = planImport(
      [
        { name: "A", email: "a@x.com", phone: "0811", tags: "" },
        { name: "B", email: "b@x.com", phone: "0811", tags: "" },
        { name: "C", email: "c@x.com", phone: "0899", tags: "" },
      ],
      mapping,
      noKeysLocal,
    );
    expect(p.summary.sharedPhoneInBatch).toBe(2);
    expect(p.summary.sharedPhone).toBe(0); // none of them collide with MASTER — a different figure
  });

  it("a refused tag is reported per row and never silently dropped — the row still imports", () => {
    const p = planImport(
      [{ name: "A", email: "a@x.com", phone: "", tags: "event:sportfest-3-2026-05|nilai:<300k|batch:abc" }],
      mapping,
      noKeysLocal,
    );
    expect(p.summary.rowsWithInvalidTags).toBe(1);
    expect(p.outcomes[0].invalidTags).toEqual(["nilai:<300k", "batch:abc"]);
    expect(p.outcomes[0].status).toBe("insert"); // one bad tag does not reject the row
    expect(p.insertRows[0].tags).toEqual(["event:sportfest-3-2026-05"]);
  });
});


describe("import confirm gate (T-67) — tag-only runs must be runnable", () => {
  const S = (netInsert: number, taggedExisting: number) =>
    ({ netInsert, taggedExisting }) as Parameters<typeof importActionableTotal>[0];

  it("THE BUG: every row already in the pool → 0 insert, 2 tag → actionable, button enabled", () => {
    expect(importActionableTotal(S(0, 2))).toBe(2);
    expect(canRunImport(S(0, 2), "Formulir cetak")).toBe(true);
  });

  it("nothing to do → 0 insert, 0 tag → NOT runnable (button stays disabled)", () => {
    expect(importActionableTotal(S(0, 0))).toBe(0);
    expect(canRunImport(S(0, 0), "Formulir cetak")).toBe(false);
  });

  it("inserts alone are still runnable (the old happy path is unchanged)", () => {
    expect(canRunImport(S(5, 0), "Formulir cetak")).toBe(true);
  });

  it("a missing collection source blocks it even when there is work to do", () => {
    expect(canRunImport(S(0, 2), "")).toBe(false);
    expect(canRunImport(S(0, 2), "   ")).toBe(false);
  });
});
