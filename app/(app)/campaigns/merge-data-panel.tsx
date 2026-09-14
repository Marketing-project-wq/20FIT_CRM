"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Download, Trash2, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { detectMergePlaceholders, validateMergeCSV } from "@/lib/crm/merge-fields";

export interface MergeRow {
  email: string;
  fields: Record<string, string>;
}

interface MergeDataPanelProps {
  templateSubject: string | null;
  templateBody: string;
  onParsed: (rows: MergeRow[] | null) => void;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parse = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === "," || ch === ";") { result.push(current); current = ""; }
        else current += ch;
      }
    }
    result.push(current);
    return result;
  };
  return { headers: parse(lines[0]), rows: lines.slice(1).map(parse) };
}

export function MergeDataPanel({ templateSubject, templateBody, onParsed }: MergeDataPanelProps) {
  const { t } = useI18n();
  const m = t.campaignsPage.mergeData;
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<MergeRow[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const mergeFields = detectMergePlaceholders(templateSubject, templateBody);
  const hasMergeFields = mergeFields.length > 0;

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setCsvErrors([]);

    file.text().then((text) => {
      const { headers, rows } = parseCSV(text);
      const validation = validateMergeCSV(headers, rows, mergeFields);

      if (!validation.ok) {
        setCsvErrors(validation.errors);
        setParsedRows(null);
        onParsed(null);
        return;
      }

      const parsed = Array.from(validation.rows.entries()).map(([email, fields]) => ({
        email,
        fields,
      }));
      setParsedRows(parsed);
      onParsed(parsed);
    });
  }, [mergeFields, onParsed]);

  const handleClear = useCallback(() => {
    setParsedRows(null);
    setCsvErrors([]);
    onParsed(null);
  }, [onParsed]);

  const downloadTemplate = useCallback(() => {
    const header = ["email", ...mergeFields].join(",");
    const sample = ["contoh@email.com", ...mergeFields.map(() => "")].join(",");
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merge-template-${mergeFields.join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mergeFields]);

  if (!hasMergeFields) return null;

  return (
    <div className="rounded-card border border-glass-border bg-glass p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-ink-soft" aria-hidden />
        <p className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">{m.sectionTitle}</p>
      </div>
      <p className="font-body text-[12px] text-ink-soft mb-3">{m.sectionHint}</p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="font-body text-[11px] text-ink-faint">{m.detectedFields}:</span>
        {mergeFields.map((f) => (
          <Badge key={f} className="font-mono text-[11px]">{`{{${f}}}`}</Badge>
        ))}
      </div>

      {csvErrors.length > 0 && (
        <div className="mb-3 rounded-sm border border-red/30 bg-red/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="h-3.5 w-3.5 text-red" aria-hidden />
            <span className="font-display text-[11px] font-bold text-red">{m.csvErrors}</span>
          </div>
          <ul className="list-disc pl-4 font-body text-[11px] text-red/80">
            {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {parsedRows && (
        <div className="mb-3 rounded-sm border border-glass-border bg-glass/50 p-3">
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-1">{m.previewTitle}</p>
          <p className="font-body text-[12px] text-ink">
            {parsedRows.length} {m.recipientCount} · {mergeFields.length} {m.fieldCount}
          </p>
          {parsedRows.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full font-body text-[11px]">
                <thead>
                  <tr className="border-b border-glass-border">
                    <th className="py-1 pr-3 text-left text-ink-faint">email</th>
                    {mergeFields.map((f) => <th key={f} className="py-1 pr-3 text-left text-ink-faint">{f}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-glass-border/50">
                      <td className="py-1 pr-3 text-ink-soft">{row.email}</td>
                      {mergeFields.map((f) => <td key={f} className="py-1 pr-3 text-ink-soft">{row.fields[f] ?? ""}</td>)}
                    </tr>
                  ))}
                  {parsedRows.length > 5 && (
                    <tr><td colSpan={mergeFields.length + 1} className="py-1 text-ink-faint">… +{parsedRows.length - 5}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} hidden />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {parsedRows ? m.uploadReplace : m.uploadBtn}
        </Button>

        <Button size="sm" variant="outline" onClick={downloadTemplate}>
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {m.downloadTemplate}
        </Button>

        {parsedRows && (
          <Button size="sm" variant="outline" onClick={handleClear}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {m.clearBtn}
          </Button>
        )}
      </div>
    </div>
  );
}
