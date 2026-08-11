import { describe, it, expect } from "vitest";
import { summarizeAuditGap, KNOWN_LEGIT_GAPS } from "./audit-gap";

describe("summarizeAuditGap", () => {
  it("no gap: contiguous ids", () => {
    const g = summarizeAuditGap(1, 10, 10);
    expect(g).toMatchObject({ span: 10, missing: 0, knownLegit: 0, unexplained: 0 });
  });

  it("the real production shape (11 Aug 2026): min 1, max 47, 43 rows -> 4 missing", () => {
    // ids 4, 37, 38, 39 missing; id=4 is known-legit -> 3 unexplained.
    const g = summarizeAuditGap(1, 47, 43);
    expect(g.span).toBe(47);
    expect(g.missing).toBe(4);
    expect(g.knownLegit).toBe(1); // id=4 in range
    expect(g.unexplained).toBe(3); // 37, 38, 39
  });

  it("id=4 is the documented known-legit gap", () => {
    expect(KNOWN_LEGIT_GAPS).toContain(4);
  });

  it("known-legit gap outside the range is not counted", () => {
    // range starts at 10, so id=4 is not in [10,20]; a real hole at 15 is unexplained.
    const g = summarizeAuditGap(10, 20, 10); // span 11, 10 rows -> 1 missing
    expect(g.missing).toBe(1);
    expect(g.knownLegit).toBe(0);
    expect(g.unexplained).toBe(1);
  });

  it("empty log -> all zeros, no false gap", () => {
    expect(summarizeAuditGap(null, null, 0)).toMatchObject({ span: 0, missing: 0, unexplained: 0 });
  });

  it("single row -> no gap", () => {
    expect(summarizeAuditGap(7, 7, 1)).toMatchObject({ span: 1, missing: 0, unexplained: 0 });
  });

  it("a mislisted known-gap cannot push unexplained negative", () => {
    // no actual gap (span==count) but knownLegit says 4 is in range -> unexplained stays 0
    const g = summarizeAuditGap(1, 5, 5, [4]);
    expect(g.missing).toBe(0);
    expect(g.knownLegit).toBe(0);
    expect(g.unexplained).toBe(0);
  });

  it("guards against inverted / nonsense bounds", () => {
    expect(summarizeAuditGap(10, 5, 3)).toMatchObject({ span: 0, missing: 0, unexplained: 0 });
  });
});
