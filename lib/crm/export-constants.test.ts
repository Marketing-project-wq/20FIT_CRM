import { describe, it, expect } from "vitest";
import {
  EXPORT_THRESHOLD,
  thresholdAction,
  EXPORT_COLUMNS,
  EXPORT_FORBIDDEN_COLUMNS,
  csvEscape,
  csvRow,
  csvHeader,
  EXPORT_ACTION,
} from "./export-constants";
import { classifyAction } from "./retention-policy";

describe("thresholdAction (PRD 17.2 split)", () => {
  it("picks at-or-below at and under the threshold, above over it", () => {
    expect(thresholdAction(0)).toBe("export.at_or_below_threshold");
    expect(thresholdAction(EXPORT_THRESHOLD)).toBe("export.at_or_below_threshold"); // ≤, inclusive
    expect(thresholdAction(EXPORT_THRESHOLD + 1)).toBe("export.above_threshold");
    expect(thresholdAction(82_253)).toBe("export.above_threshold");
  });
});

describe("export column safety", () => {
  it("never lists a forbidden (NIK / clinical / DOB) column — a file outlives the health gate", () => {
    for (const c of EXPORT_COLUMNS) {
      expect(EXPORT_FORBIDDEN_COLUMNS.has(c.column)).toBe(false);
    }
  });
  it("exports only the expected contact/attribute columns (no surprise column)", () => {
    expect(EXPORT_COLUMNS.map((c) => c.column)).toEqual([
      "customer_id", "full_name", "email", "phone_normalized", "city", "first_unit", "segment", "lifetime_value",
    ]);
  });
});

describe("csvEscape (RFC 4180 + formula-injection guard)", () => {
  it("passes through a plain value", () => {
    expect(csvEscape("Budi")).toBe("Budi");
    expect(csvEscape(1500000)).toBe("1500000");
    expect(csvEscape(null)).toBe("");
  });
  it("quotes and doubles quotes when the value has a comma / quote / newline", () => {
    expect(csvEscape("Jakarta, DKI")).toBe('"Jakarta, DKI"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralises a spreadsheet formula-injection leader with a leading quote", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+62812")).toBe("'+62812"); // Excel treats leading ' as force-text
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("-2")).toBe("'-2");
  });
  it("combines both guards: a formula leader that also needs quoting", () => {
    expect(csvEscape("=HYPERLINK(\"x\"),y")).toBe('"\'=HYPERLINK(""x""),y"');
  });
});

describe("csvRow / csvHeader", () => {
  it("joins with commas and ends with CRLF", () => {
    expect(csvRow(["a", "b"])).toBe("a,b\r\n");
  });
  it("header row is the EXPORT_COLUMNS labels", () => {
    expect(csvHeader()).toBe("customer_id,nama,email,telepon,kota,unit_pertama,segment,lifetime_value\r\n");
  });
});

describe("export.performed audit action (migration-8 denylist parity)", () => {
  it("classifies as COMPLIANCE — excluded from purge permanently (3E parity)", () => {
    expect(EXPORT_ACTION).toBe("export.performed");
    expect(classifyAction(EXPORT_ACTION)).toBe("compliance");
  });
});
