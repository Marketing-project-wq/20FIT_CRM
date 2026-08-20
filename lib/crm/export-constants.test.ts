import { describe, it, expect } from "vitest";
import {
  EXPORT_THRESHOLD,
  thresholdAction,
  EXPORT_COLUMNS,
  EXPORT_FORBIDDEN_COLUMNS,
  resolveExportColumns,
  csvEscape,
  csvRow,
  csvHeader,
  excelText,
  slugify,
  exportFileName,
  EXPORT_ACTION,
} from "./export-constants";
import { classifyAction } from "./retention-policy";

const COL_VARIANTS = [
  { email: true, phone: true },
  { email: true, phone: false },
  { email: false, phone: true },
  { email: false, phone: false },
];

describe("thresholdAction (PRD 17.2 split)", () => {
  it("picks at-or-below at and under the threshold, above over it", () => {
    expect(thresholdAction(0)).toBe("export.at_or_below_threshold");
    expect(thresholdAction(EXPORT_THRESHOLD)).toBe("export.at_or_below_threshold"); // ≤, inclusive
    expect(thresholdAction(EXPORT_THRESHOLD + 1)).toBe("export.above_threshold");
    expect(thresholdAction(82_253)).toBe("export.above_threshold");
  });
});

describe("export column safety", () => {
  it("never lists a forbidden (NIK / clinical / DOB) column — for EVERY category variant", () => {
    // The guard must bite on each per-category column set, not just the default (MASALAH 1).
    for (const v of COL_VARIANTS) {
      for (const c of resolveExportColumns(v)) {
        expect(EXPORT_FORBIDDEN_COLUMNS.has(c.column)).toBe(false);
      }
    }
  });
  it("exports only the expected contact/attribute columns (default = both contact columns)", () => {
    // email DISPLAY column is email_normalized — the same field the filter tests (MASALAH 3).
    expect(EXPORT_COLUMNS.map((c) => c.column)).toEqual([
      "customer_id", "full_name", "email_normalized", "phone_normalized", "city", "first_unit", "segment", "lifetime_value",
    ]);
  });
  it("contact columns follow the toggle; attribute columns are always present", () => {
    expect(resolveExportColumns({ email: true, phone: false }).map((c) => c.column)).toEqual([
      "customer_id", "full_name", "email_normalized", "city", "first_unit", "segment", "lifetime_value",
    ]);
    expect(resolveExportColumns({ email: false, phone: true }).map((c) => c.column)).toEqual([
      "customer_id", "full_name", "phone_normalized", "city", "first_unit", "segment", "lifetime_value",
    ]);
    expect(resolveExportColumns({ email: false, phone: false }).map((c) => c.column)).toEqual([
      "customer_id", "full_name", "city", "first_unit", "segment", "lifetime_value",
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
  it("default header row is the EXPORT_COLUMNS labels", () => {
    expect(csvHeader()).toBe("customer_id,nama,email,telepon,kota,unit_pertama,segment,lifetime_value\r\n");
  });
  it("header follows the given (narrowed) column list", () => {
    expect(csvHeader(resolveExportColumns({ email: false, phone: true }))).toBe(
      "customer_id,nama,telepon,kota,unit_pertama,segment,lifetime_value\r\n",
    );
  });
});

describe("excelText — phone renders as spreadsheet TEXT, not scientific notation (MASALAH 4)", () => {
  it("wraps a digit run in the ='…' text formula, RFC-escaped, so Excel shows the full number", () => {
    // Field content Excel parses back to `="628…"` then evaluates to the text 628….
    expect(csvEscape(excelText("628111000001"))).toBe('"=""628111000001"""');
    expect(csvRow([excelText("628111000001")])).toBe('"=""628111000001"""\r\n');
  });
  it("does NOT double-apply the formula-injection guard (the value is trusted, digits only)", () => {
    // A plain "=1+1" (untrusted) is still neutralised — excelText is a separate, deliberate path.
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape(excelText("=1+1"))).toBe('"=""=1+1"""'); // wrapped verbatim, no leading quote
  });
});

describe("slugify / exportFileName (MASALAH 2)", () => {
  it("slug is lowercase, hyphen-joined, capped, and Windows-safe", () => {
    expect(slugify("punya email DAN tanpa telepon")).toBe("punya-email-dan-tanpa-telepon");
    expect(slugify('a/b:c*d?e"f<g>h|i')).toBe("a-b-c-d-e-f-g-h-i");
    expect(slugify("(email atau telepon) dan unit arena")).toBe("email-atau-telepon-dan-unit-arena");
    expect(slugify("")).toBe("segmen");
    expect(slugify("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });
  it("file name carries base, category, date and time so same-day downloads stay distinct", () => {
    expect(exportFileName("segmen", "punya email dan telepon", "2026-08-20T04:13:59.000Z")).toBe(
      "segmen-punya-email-dan-telepon-2026-08-20-0413.csv",
    );
    // English base word, and a different minute → a different, non-colliding name.
    expect(exportFileName("segment", "email only", "2026-08-20T09:02:00.000Z")).toBe(
      "segment-email-only-2026-08-20-0902.csv",
    );
  });
});

describe("export.performed audit action (migration-8 denylist parity)", () => {
  it("classifies as COMPLIANCE — excluded from purge permanently (3E parity)", () => {
    expect(EXPORT_ACTION).toBe("export.performed");
    expect(classifyAction(EXPORT_ACTION)).toBe("compliance");
  });
});
