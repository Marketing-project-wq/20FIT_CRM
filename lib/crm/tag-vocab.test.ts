import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchPoolTagCounts, fetchPoolTagVocab } from "./tag-vocab";

/**
 * TUGAS 1: counts are tallied in memory over the tagged rows, fail-loud on a read error, and only
 * operator tags are counted (system tags like batch:/csv_import are ignored). A fake client returns
 * one page of rows then an empty page to end pagination.
 */
type Row = { tags: string[] | null };
function fakeClient(pages: Row[][], errorOnPage = -1) {
  let call = -1;
  return {
    from() {
      return {
        select() {
          return {
            neq() {
              return {
                range() {
                  call += 1;
                  if (call === errorOnPage) return Promise.resolve({ data: null, error: { code: "XX000" } });
                  return Promise.resolve({ data: pages[call] ?? [], error: null });
                },
              };
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("fetchPoolTagCounts", () => {
  it("tallies operator tags across rows, ignores system tags, sorts by people desc", async () => {
    const rows: Row[] = [
      { tags: ["event:a-1", "csv_import", "batch:x", "peran:pendaftar"] },
      { tags: ["event:a-1", "peran:pendaftar"] },
      { tags: ["event:a-1"] },
      { tags: null },
    ];
    const out = await fetchPoolTagCounts(fakeClient([rows]));
    expect(out.entries).toEqual([
      { tag: "event:a-1", people: 3 },
      { tag: "peran:pendaftar", people: 2 },
    ]); // system tags (csv_import, batch:x) not counted; sorted desc
  });

  it("counts DISTINCT people per namespace — a person with two event tags counts once", async () => {
    const rows: Row[] = [
      { tags: ["event:a-1", "event:b-2"] }, // one person, TWO event tags → event namespace +1
      { tags: ["event:a-1", "peran:pendaftar"] }, // event +1, peran +1
      { tags: ["peran:pendaftar"] }, // peran +1
    ];
    const out = await fetchPoolTagCounts(fakeClient([rows]));
    // Summing per-tag would give event = 3 (a-1:2 + b-2:1); DISTINCT people is 2.
    expect(out.namespacePeople).toEqual({ event: 2, peran: 2 });
    expect(out.entries.find((e) => e.tag === "event:a-1")?.people).toBe(2);
  });

  it("THROWS on a read error (never returns a half count)", async () => {
    await expect(fetchPoolTagCounts(fakeClient([[{ tags: ["event:a-1"] }]], 0))).rejects.toMatchObject({ code: "XX000" });
  });

  it("fetchPoolTagVocab returns just the tags", async () => {
    const vocab = await fetchPoolTagVocab(fakeClient([[{ tags: ["event:a-1", "peran:pendaftar"] }]]));
    expect(new Set(vocab)).toEqual(new Set(["event:a-1", "peran:pendaftar"]));
  });
});
