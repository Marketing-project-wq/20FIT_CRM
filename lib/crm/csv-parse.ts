import "server-only";
import Papa from "papaparse";

/**
 * THE ONE CSV parser (T-73). papaparse with the exact config the audience import has always used:
 * headered records, greedy empty-line skipping, automatic delimiter detection (papaparse tries , \t |
 * ; and picks the one giving the most consistent column count — this is why the Indonesian CS files
 * that use `;` parse correctly without a second code path). Used by the audience import route AND the
 * manual email-list CSV upload, so there is exactly one parser and one delimiter behaviour, never two.
 *
 * `delimiter` is surfaced so a caller can show papaparse's choice and catch the rare misdetection
 * (a `;` file misread as `,` lands every value in one column → one header).
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function parseCsvText(csvText: string): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: "greedy" });
  const headers = (parsed.meta.fields ?? []).map((h) => h.trim());
  const rows = (parsed.data ?? []).filter((r) => r && typeof r === "object");
  const delimiter = parsed.meta.delimiter || ",";
  return { headers, rows, delimiter };
}
