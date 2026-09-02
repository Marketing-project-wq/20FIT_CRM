import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseCriteria, hasClinicalCriteria, clinicalProgramKeys } from "./segment";
import { sanitizeAssistOutput } from "./segment-ai-shared";

/**
 * LOCKSTEP: the clinical gate must classify identically on BOTH paths that let a role express a
 * segment — the manual /segments route and the AI assistant. The route REJECTS a clinical request
 * (403 when hasClinicalCriteria is true); the AI STRIPS the clinical keys and flags clinicalBlocked.
 * Different ACTIONS, but ONE classifier (hasClinicalCriteria / clinicalProgramKeys). This file is the
 * tripwire: for a shared fixture set it asserts the route's gate boolean and the AI's blocked flag
 * are ALWAYS equal, and that a clinical program key can never survive the AI strip for a role without
 * view_health. If someone rewires one path to a different notion of "clinical", a fixture breaks here.
 */
const FIXTURES: { name: string; raw: Record<string, unknown>; clinical: boolean }[] = [
  { name: "non-clinical program only", raw: { srcProgram: ["sportfest_half"] }, clinical: false },
  { name: "clinic-patient program", raw: { srcProgram: ["clinic_2024_2025"] }, clinical: true },
  { name: "other clinic-patient program", raw: { srcProgram: ["clinic_2025_2026"] }, clinical: true },
  { name: "mixed clinical + non-clinical programs", raw: { srcProgram: ["sportfest_half", "clinic_2025_2026", "runfest_5k"] }, clinical: true },
  { name: "srcClinicPatient flag", raw: { srcClinicPatient: true }, clinical: true },
  { name: "srcClinicTxn flag", raw: { srcClinicTxn: true }, clinical: true },
  { name: "no clinical dimension at all", raw: { srcProgram: ["runfest_5k"], srcRfm: ["Loyal user"] }, clinical: false },
  { name: "empty", raw: {}, clinical: false },
];

describe("clinical gate is lockstep across the manual route and the AI assistant", () => {
  for (const f of FIXTURES) {
    it(`agrees for: ${f.name}`, () => {
      // Manual route: it computes parseCriteria(body) then 403s iff hasClinicalCriteria is true.
      const routeGate = hasClinicalCriteria(parseCriteria(f.raw));
      expect(routeGate).toBe(f.clinical);

      // AI assistant, role WITHOUT view_health: same classifier drives clinicalBlocked.
      const ai = sanitizeAssistOutput(f.raw, { canViewHealth: false });
      expect(ai.clinicalBlocked).toBe(routeGate); // ← the lockstep: gate boolean === blocked flag

      // Security invariant: no clinical program key ever survives the strip for this role.
      expect(clinicalProgramKeys(ai.criteria.srcProgram)).toEqual([]);
    });
  }

  it("with view_health, nothing is stripped and clinical keys survive", () => {
    const ai = sanitizeAssistOutput(
      { srcProgram: ["sportfest_half", "clinic_2024_2025"], srcClinicPatient: true },
      { canViewHealth: true },
    );
    expect(ai.clinicalBlocked).toBe(false);
    expect(ai.criteria.srcProgram).toEqual(["sportfest_half", "clinic_2024_2025"]);
    expect(ai.criteria.srcClinicPatient).toBe(true);
  });
});
