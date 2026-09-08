import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { guessColumnMapping, normalizeMappedRow } from "./import-audience";

/**
 * BUG 2 (8 Sep 2026): owner's `email_20fit_admin.csv` uses `;` (Excel Indonesia) and header `Nama`.
 * The two people landed with full_name NULL — but that was the 04:16 DIRECT RPC call (full_name:null,
 * T-65), NOT the wizard. This pins that the WIZARD recognises `Nama` and reads the name, and that the
 * semicolon delimiter is handled — so the next CS file (almost certainly `;`) does not silently break.
 */
describe("import — owner's semicolon file with a `Nama` header maps correctly", () => {
  const csv = "Nama;Email\r\nTifany;tifany@20fit.id\r\nMarketing 20fit;marketing@20fit.id\r\n";
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy" });

  it("papaparse auto-detects the semicolon delimiter (Excel Indonesia default)", () => {
    expect(parsed.meta.delimiter).toBe(";");
    expect(parsed.meta.fields).toEqual(["Nama", "Email"]);
  });

  it("`Nama` is recognised as full_name; `Email` as email", () => {
    const mapping = guessColumnMapping(parsed.meta.fields ?? []);
    expect(mapping).toEqual({ Nama: "full_name", Email: "email" });
  });

  it("the names are actually read off the rows (not dropped)", () => {
    const mapping = guessColumnMapping(parsed.meta.fields ?? []);
    const rows = parsed.data.map((r) => normalizeMappedRow(r, mapping));
    expect(rows[0].fullName).toBe("Tifany");
    expect(rows[0].email).toBe("tifany@20fit.id");
    expect(rows[1].fullName).toBe("Marketing 20fit");
    expect(rows[1].email).toBe("marketing@20fit.id");
  });

  it("the Indonesian name-header variants all map to full_name", () => {
    for (const h of ["Nama", "nama", "Nama Lengkap", "Full Name", "full_name", "name"]) {
      expect(guessColumnMapping([h])[h], `${h} should map to full_name`).toBe("full_name");
    }
  });
});
