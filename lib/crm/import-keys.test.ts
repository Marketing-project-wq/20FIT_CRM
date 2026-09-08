import { describe, it, expect } from "vitest";
import { loadImportKeys, IMPORT_LOOKUP_CHUNK, type ImportReadClient } from "./import-keys";

/**
 * TUGAS 5 layer 1 (T-69): the extracted key reader FAILS LOUD. The original bug was a read whose error
 * was discarded, so a failed lookup looked like an empty table and the import proceeded to write a half
 * result under a green check. These tests pin the opposite: a read error THROWS, and it throws BEFORE
 * returning any keys — so the route (which calls this first, inside try/catch) never reaches a write.
 */

type Row = Record<string, unknown>;
type PgResult = { data: Row[] | null; error: { code?: string | null } | null };

interface Behaviour {
  email?: PgResult | ((chunk: readonly string[]) => PgResult);
  phone?: PgResult | ((chunk: readonly string[]) => PgResult);
  suppression?: PgResult;
}

/** A fake ImportReadClient that records every `.in()` chunk it was asked for. */
function fakeClient(b: Behaviour) {
  const calls: { table: string; column: string; size: number }[] = [];
  const client: ImportReadClient = {
    from(table: string) {
      return {
        select() {
          return {
            in(column: string, values: readonly string[]): PromiseLike<PgResult> {
              calls.push({ table, column, size: values.length });
              const spec = column === "email_normalized" ? b.email : b.phone;
              const res = typeof spec === "function" ? spec(values) : spec ?? { data: [], error: null };
              return Promise.resolve(res);
            },
            eq(): PromiseLike<PgResult> {
              return Promise.resolve(b.suppression ?? { data: [], error: null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const emails = (n: number) => Array.from({ length: n }, (_, i) => `u${i}@x.com`);

describe("loadImportKeys — fail loud", () => {
  it("THROWS when the email read errors (does not swallow, does not return empty keys)", async () => {
    const { client } = fakeClient({ email: { data: null, error: { code: "PGRST103" } } });
    await expect(loadImportKeys(client, emails(3), [])).rejects.toMatchObject({ code: "PGRST103" });
  });

  it("THROWS with read_failed when the error has no usable code (the 400 URL case)", async () => {
    const { client } = fakeClient({ email: { data: null, error: { code: undefined } } });
    await expect(loadImportKeys(client, emails(3), [])).rejects.toMatchObject({ code: "read_failed" });
  });

  it("THROWS when the phone read errors", async () => {
    const { client } = fakeClient({ email: { data: [], error: null }, phone: { data: null, error: { code: "XX000" } } });
    await expect(loadImportKeys(client, emails(2), ["6281"])).rejects.toMatchObject({ code: "XX000" });
  });

  it("THROWS when the suppression read errors", async () => {
    const { client } = fakeClient({ email: { data: [], error: null }, suppression: { data: null, error: { code: "42501" } } });
    await expect(loadImportKeys(client, emails(1), [])).rejects.toMatchObject({ code: "42501" });
  });
});

describe("loadImportKeys — chunking bounds the URL", () => {
  it("splits emails into IMPORT_LOOKUP_CHUNK-sized .in() calls", async () => {
    const n = IMPORT_LOOKUP_CHUNK * 2 + 37; // 637 with chunk 300 → 3 calls (300, 300, 37)
    const { client, calls } = fakeClient({ email: { data: [], error: null } });
    await loadImportKeys(client, emails(n), []);
    const emailCalls = calls.filter((c) => c.column === "email_normalized");
    expect(emailCalls.map((c) => c.size)).toEqual([IMPORT_LOOKUP_CHUNK, IMPORT_LOOKUP_CHUNK, 37]);
    expect(emailCalls.every((c) => c.size <= IMPORT_LOOKUP_CHUNK)).toBe(true);
  });

  it("aggregates rows across chunks and classifies existing vs taggable (merged_into)", async () => {
    // 301 emails → 2 chunks. First chunk returns one existing+taggable and one merged (existing, not taggable).
    const { client } = fakeClient({
      email: (chunk) =>
        chunk.includes("u0@x.com")
          ? { data: [ { email_normalized: "u0@x.com", merged_into: null }, { email_normalized: "u1@x.com", merged_into: "abc" } ], error: null }
          : { data: [], error: null },
      suppression: { data: [{ identity_kind: "email", identity_key: "u0@x.com" }, { identity_kind: "phone", identity_key: "628" }], error: null },
    });
    const keys = await loadImportKeys(client, emails(IMPORT_LOOKUP_CHUNK + 1), []);
    expect(keys.existingEmails.has("u0@x.com")).toBe(true);
    expect(keys.existingEmails.has("u1@x.com")).toBe(true); // merged rows count as existing (anti-join sees them)
    expect(keys.taggableEmails.has("u0@x.com")).toBe(true);
    expect(keys.taggableEmails.has("u1@x.com")).toBe(false); // merged → not taggable (T-55)
    expect(keys.suppressedEmails.has("u0@x.com")).toBe(true);
    expect(keys.suppressedPhones.has("628")).toBe(true);
  });

  it("chunk size stays safely under the measured ~24 KB URL break", () => {
    // Worst-case 54-char email, urlencoded ~ +5 (%40 for @, %2C comma) ≈ 59 bytes/item.
    // 300 × 59 ≈ 17.7 KB < ~24 KB break (measured 8 Sep: 450 max-len emails = 23.4 KB still 200).
    expect(IMPORT_LOOKUP_CHUNK * 59).toBeLessThan(24_000);
  });
});
