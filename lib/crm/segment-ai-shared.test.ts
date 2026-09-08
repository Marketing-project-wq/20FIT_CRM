import { describe, it, expect } from "vitest";
import { sanitizeAssistOutput, describeProposal, proposalIsEmpty, buildAiExamples } from "./segment-ai-shared";
import { isOperatorTag, tagValueLabel } from "./tags";

describe("sanitizeAssistOutput — the AI security boundary", () => {
  it("keeps valid closed-list conditions and drops unknown fields/values", () => {
    const p = sanitizeAssistOutput(
      {
        conditions: [
          { field: "unit", value: "arena" }, // valid
          { field: "segment", value: "loyal" }, // valid
          { field: "unit", value: "atlantis" }, // invalid value → drop
          { field: "revenue", value: "has" }, // valid
          { field: "revenue", value: "all" }, // no-op → drop
          { field: "nonsense", value: "x" }, // unknown field → drop
        ],
      },
      { canViewHealth: true },
    );
    expect(p.conditions).toEqual([
      { field: "unit", value: "arena" },
      { field: "segment", value: "loyal" },
      { field: "revenue", value: "has" },
    ]);
  });

  it("NEVER passes a time-based criterion — there is no field for one (K-19)", () => {
    const p = sanitizeAssistOutput(
      { conditions: [{ field: "joined_days", value: "90" }, { field: "last_activity_at", value: "x" }] },
      { canViewHealth: true },
    );
    expect(p.conditions).toEqual([]); // both dropped
  });

  it("validates eco/src criteria via the existing parser (closed lists), incl. RFM misspelling", () => {
    const p = sanitizeAssistOutput(
      { srcHyrox: true, srcRfm: "Campion user", srcProgram: "fitco_user", ecoUnit: "not_a_unit" },
      { canViewHealth: true },
    );
    expect(p.criteria.srcHyrox).toBe(true);
    expect(p.criteria.srcRfm).toEqual(["Campion user"]); // legacy bare string accepted → array
    expect(p.criteria.srcProgram).toEqual(["fitco_user"]);
    expect(p.criteria.ecoUnit).toBeNull(); // unknown eco unit rejected
  });

  it("ENFORCES the clinical gate: strips clinic criteria for a role without view_health", () => {
    const blocked = sanitizeAssistOutput(
      { srcClinicPatient: true, srcProgram: "clinic_2024_2025" },
      { canViewHealth: false },
    );
    expect(blocked.clinicalBlocked).toBe(true);
    expect(blocked.criteria.srcClinicPatient).toBe(false);
    expect(blocked.criteria.srcProgram).toEqual([]); // clinical program stripped

    const allowed = sanitizeAssistOutput(
      { srcClinicPatient: true, srcProgram: "clinic_2024_2025" },
      { canViewHealth: true },
    );
    expect(allowed.clinicalBlocked).toBe(false);
    expect(allowed.criteria.srcClinicPatient).toBe(true);
    expect(allowed.criteria.srcProgram).toEqual(["clinic_2024_2025"]);
  });

  it("PER-ELEMENT strip: drops only the clinical key, keeps the non-clinical one (no view_health)", () => {
    const p = sanitizeAssistOutput(
      { srcProgram: ["sportfest_half", "clinic_2024_2025", "runfest_5k"] },
      { canViewHealth: false },
    );
    expect(p.clinicalBlocked).toBe(true);
    expect(p.criteria.srcProgram).toEqual(["sportfest_half", "runfest_5k"]); // clinic gone, rest survive
  });

  it("keeps a NON-clinical program for a role without view_health (only clinic is gated)", () => {
    const p = sanitizeAssistOutput({ srcProgram: "runfest_5k" }, { canViewHealth: false });
    expect(p.clinicalBlocked).toBe(false);
    expect(p.criteria.srcProgram).toEqual(["runfest_5k"]);
  });

  it("caps conditions, unexpressible notes, and the note length", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ field: "city", value: `Kota${i}` }));
    const p = sanitizeAssistOutput(
      { conditions: many, unexpressible: Array.from({ length: 30 }, (_, i) => `r${i}`), notes: "x".repeat(500) },
      { canViewHealth: true },
    );
    expect(p.conditions.length).toBeLessThanOrEqual(12);
    expect(p.unexpressible.length).toBeLessThanOrEqual(8);
    expect(p.notes.length).toBeLessThanOrEqual(240);
  });

  it("de-dupes identical conditions", () => {
    const p = sanitizeAssistOutput(
      { conditions: [{ field: "hasEmail", value: "" }, { field: "hasEmail", value: "" }] },
      { canViewHealth: true },
    );
    expect(p.conditions).toEqual([{ field: "hasEmail", value: "" }]);
  });
});

describe("describeProposal / proposalIsEmpty", () => {
  it("renders a readable AND sentence", () => {
    const p = sanitizeAssistOutput(
      { conditions: [{ field: "hasEmail", value: "" }], srcProgram: "runfest_5k" },
      { canViewHealth: true },
    );
    expect(describeProposal(p)).toContain("punya email");
    expect(describeProposal(p)).toContain("DAN");
    expect(proposalIsEmpty(p)).toBe(false);
  });
  it("flags an empty proposal (model mapped nothing)", () => {
    const p = sanitizeAssistOutput({ unexpressible: ["aktif 3 bulan terakhir tidak bisa"] }, { canViewHealth: true });
    expect(proposalIsEmpty(p)).toBe(true);
    expect(p.unexpressible[0]).toContain("3 bulan");
    expect(describeProposal(p)).toContain("seluruh pool");
  });
});

// ── TUGAS D: tags map ONLY to the real pool vocabulary; an unknown tag is dropped, never guessed ──
describe("sanitizeAssistOutput — tag vocabulary + preserved refusal", () => {
  const POOL = ["event:sportfest-2-2026-02", "event:platarox-2026-07", "peran:peserta"];

  it("keeps proposed tags that ARE in the pool (tagsAny + tagsAll)", () => {
    const p = sanitizeAssistOutput(
      { tagsAny: ["event:sportfest-2-2026-02", "event:platarox-2026-07"], tagsAll: ["peran:peserta"] },
      { canViewHealth: true, allowedTags: POOL },
    );
    expect(p.criteria.tagsAny).toEqual(["event:sportfest-2-2026-02", "event:platarox-2026-07"]);
    expect(p.criteria.tagsAll).toEqual(["peran:peserta"]);
    expect(proposalIsEmpty(p)).toBe(false);
  });

  it("DROPS a tag not in the pool — and the proposal is then empty (refusal preserved, not guessed)", () => {
    // The model invented a plausible-looking but non-existent event. It must NOT be kept, and must
    // NOT be bent to a neighbour like sportfest-2. Nothing else mapped → proposalIsEmpty → the route
    // returns "couldn't map", exactly the refusal the owner asked to keep.
    const p = sanitizeAssistOutput(
      { tagsAny: ["event:iss-jhr-2026"] },
      { canViewHealth: true, allowedTags: POOL },
    );
    expect(p.criteria.tagsAny).toEqual([]);
    expect(proposalIsEmpty(p)).toBe(true);
  });

  it("keeps the valid tags and drops only the unknown ones in a mixed proposal", () => {
    const p = sanitizeAssistOutput(
      { tagsAny: ["event:sportfest-2-2026-02", "event:does-not-exist"] },
      { canViewHealth: true, allowedTags: POOL },
    );
    expect(p.criteria.tagsAny).toEqual(["event:sportfest-2-2026-02"]);
  });

  it("still drops a malformed (non-operator) tag by shape even before the pool check", () => {
    const p = sanitizeAssistOutput(
      { tagsAny: ["not a tag", "EVENT:UPPER", "event:sportfest-2-2026-02"] },
      { canViewHealth: true, allowedTags: POOL },
    );
    expect(p.criteria.tagsAny).toEqual(["event:sportfest-2-2026-02"]);
  });
});

// ── TUGAS 4: AI example prompts are generated from REAL pool tags (never a fake that maps to zero) ──
describe("buildAiExamples — examples reference only tags that exist in the pool", () => {
  const entries = [
    { tag: "event:sportfest-3-2026-05", people: 1561 },
    { tag: "event:sportfest-2-2026-02", people: 1432 },
    { tag: "peran:pendaftar", people: 673 }, // not an event → must not seed an example
  ];

  it("names the top events by count, in words the model can map to real tags", () => {
    const ex = buildAiExamples(entries, "id");
    expect(ex.length).toBeGreaterThan(0);
    // Every event label that appears MUST come from a real event tag in the pool.
    const eventLabels = entries.filter((e) => e.tag.startsWith("event:")).map((e) => tagValueLabel(e.tag, "id"));
    // The top event (by people) is sportfest-3; it must appear in an example.
    expect(ex.join(" ")).toContain(tagValueLabel("event:sportfest-3-2026-05", "id"));
    // No example may mention a string that isn't a real event label (guard against invented events).
    for (const e of ex) {
      const mentionsReal = eventLabels.some((l) => e.includes(l));
      expect(mentionsReal, e).toBe(true);
    }
  });

  it("returns nothing when the pool has no event tags (never invents one)", () => {
    expect(buildAiExamples([{ tag: "peran:pendaftar", people: 5 }], "id")).toEqual([]);
    expect(buildAiExamples([], "en")).toEqual([]);
  });

  it("every referenced event tag is a valid operator tag", () => {
    // Sanity: the tags we build labels from are real operator tags.
    for (const e of entries.filter((x) => x.tag.startsWith("event:"))) expect(isOperatorTag(e.tag)).toBe(true);
  });
});
