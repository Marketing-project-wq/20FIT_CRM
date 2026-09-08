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
    expect(out).toEqual([
      { tag: "event:a-1", people: 3 },
      { tag: "peran:pendaftar", people: 2 },
    ]); // system tags (csv_import, batch:x) not counted; sorted desc
  });

  it("THROWS on a read error (never returns a half count)", async () => {
    await expect(fetchPoolTagCounts(fakeClient([[{ tags: ["event:a-1"] }]], 0))).rejects.toMatchObject({ code: "XX000" });
  });

  it("fetchPoolTagVocab returns just the tags", async () => {
    const vocab = await fetchPoolTagVocab(fakeClient([[{ tags: ["event:a-1", "peran:pendaftar"] }]]));
    expect(new Set(vocab)).toEqual(new Set(["event:a-1", "peran:pendaftar"]));
  });
});
