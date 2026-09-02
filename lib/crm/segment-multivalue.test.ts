import { describe, it, expect } from "vitest";

import { unionSets, intersectSets } from "./id-sets";

/**
 * Multi-value criteria (srcProgram / srcRfm) resolve as OR WITHIN the criterion, AND ACROSS
 * criteria. The resolver folds each selected value's id-set with `unionSets`, pushes that ONE
 * union into the id-set list, and `intersectSets` ANDs it with the other criteria. These tests
 * prove that exact composition on the pure set algebra — the same two helpers the resolver calls.
 */
describe("multi-value set algebra (OR within a criterion, AND across criteria)", () => {
  const S = (...xs: string[]) => new Set(xs);

  it("unionSets is OR: a member of ANY selected value's set is included", () => {
    const half = S("a", "b");
    const double = S("b", "c");
    expect(Array.from(unionSets([half, double])).sort()).toEqual(["a", "b", "c"]);
  });

  it("unionSets of an empty list is empty; of one set is that set", () => {
    expect(unionSets([]).size).toBe(0);
    expect(Array.from(unionSets([S("x", "y")])).sort()).toEqual(["x", "y"]);
  });

  it("intersectSets is AND: only members of EVERY set survive", () => {
    expect(Array.from(intersectSets([S("a", "b", "c"), S("b", "c", "d")])!).sort()).toEqual(["b", "c"]);
  });

  it("the resolver's composition: (Half OR Double) AND Jakarta", () => {
    // Programs are OR'd into one set, THEN intersected with an unrelated criterion (e.g. a city set).
    const programUnion = unionSets([S("p1", "p2"), S("p2", "p3")]); // Half ∪ Double = {p1,p2,p3}
    const cityJakarta = S("p2", "p3", "p9"); // people in Jakarta
    const result = intersectSets([programUnion, cityJakarta]); // union AND city
    expect(Array.from(result!).sort()).toEqual(["p2", "p3"]); // in (Half OR Double) AND in Jakarta
    // p1 is Half but not Jakarta → excluded by the AND; p9 is Jakarta but no program → excluded.
  });

  it("OR widens, AND never does: a program-only member is NOT added by intersecting with a city", () => {
    const programUnion = unionSets([S("only_program")]);
    const city = S("someone_else");
    expect(intersectSets([programUnion, city])!.size).toBe(0);
  });
});
