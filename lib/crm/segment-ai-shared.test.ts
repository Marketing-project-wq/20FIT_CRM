import { describe, it, expect } from "vitest";
import { sanitizeAssistOutput, describeProposal, proposalIsEmpty } from "./segment-ai-shared";

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
