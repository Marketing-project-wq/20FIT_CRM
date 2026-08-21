import { describe, it, expect } from "vitest";
import {
  CLINIC_PATIENT_SAFE_COLUMNS,
  CLINIC_PATIENT_SENSITIVE_COLUMNS,
  CLINIC_BOOKING_SAFE_COLUMNS,
  CLINIC_FORBIDDEN_COLUMNS,
} from "./clinic-source-constants";

describe("clinic source column discipline (TUGAS 3 — health data)", () => {
  it("no NON-SENSITIVE safe column is in the forbidden set (clinical content never selected)", () => {
    for (const col of [...CLINIC_PATIENT_SAFE_COLUMNS, ...CLINIC_BOOKING_SAFE_COLUMNS]) {
      expect(CLINIC_FORBIDDEN_COLUMNS.has(col), `${col} is forbidden but listed safe`).toBe(false);
    }
  });

  it("the sensitive list is exactly the identity fields CS verifies — NIK, DOB, gender, address, emergency contact", () => {
    expect([...CLINIC_PATIENT_SENSITIVE_COLUMNS].sort()).toEqual(
      ["address", "date_of_birth", "emergency_contact_name", "emergency_contact_phone", "gender", "id_number"].sort(),
    );
  });

  it("clinical CONTENT is in the forbidden set — the deliberate omission from the CS screen", () => {
    for (const c of ["diagnosis", "result", "medication", "surgery", "notes", "posture", "anamnesis"]) {
      expect(CLINIC_FORBIDDEN_COLUMNS.has(c)).toBe(true);
    }
  });

  it("raw contact identity is forbidden (already matched on; re-showing is redundant)", () => {
    expect(CLINIC_FORBIDDEN_COLUMNS.has("email")).toBe(true);
    expect(CLINIC_FORBIDDEN_COLUMNS.has("phone")).toBe(true);
  });
});
