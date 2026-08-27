"use client";

import { Plus, X } from "lucide-react";
import { type LeafField } from "@/lib/crm/filter-tree";
import { AUDIENCE_UNITS, AUDIENCE_SEGMENTS, SEGMENT_NULL } from "@/lib/crm/audience-constants";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Row } from "@/components/segments/filter-tree-builder";

/**
 * Simplified AND-only filter list. Every row is one condition — no OR groups, no nesting.
 * A CRM manager picks a category in plain language and a value; all rows are combined with AND.
 * Emits the SAME Row[] shape (all t:"cond") that rowsToTree already understands, so the data
 * layer and API are untouched. The old FilterTreeBuilder (with OR groups) is retired from the
 * everyday path — most segments never need OR, and it was the most confusing control on screen.
 */

const selectCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-2 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

// The categories offered here, in plain language. hasEmail/hasPhone live in the dedicated Kontak
// group, so they are not repeated here — this list is demographic attributes only.
const CATEGORIES: LeafField[] = ["city", "unit", "segment", "revenue"];

function categoryLabel(field: LeafField, t: ReturnType<typeof useI18n>["t"]): string {
  switch (field) {
    case "city": return t.segments.fieldCity;
    case "unit": return t.segments.fieldUnit;
    case "segment": return t.segments.fieldSegment;
    case "revenue": return t.segments.fieldRevenue;
    default: return field;
  }
}

function defaultValue(field: LeafField): string {
  if (field === "unit") return AUDIENCE_UNITS[0];
  if (field === "segment") return AUDIENCE_SEGMENTS[0];
  if (field === "revenue") return "has";
  return "";
}

function ValueControl({
  field, value, onChange,
}: { field: LeafField; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  if (field === "unit") {
    return (
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {AUDIENCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    );
  }
  if (field === "segment") {
    return (
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {AUDIENCE_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value={SEGMENT_NULL}>{t.segments.noSegmentOption}</option>
      </select>
    );
  }
  if (field === "revenue") {
    return (
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="has">{t.segments.revHas}</option>
        <option value="none">{t.segments.revNone}</option>
        <option value="negative">{t.segments.revNegative}</option>
      </select>
    );
  }
  return (
    <input
      className={`${selectCls} placeholder:text-ink-faint`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t.segments.cityInputPlaceholder}
    />
  );
}

/** Only the AND-only condition rows are editable here; any OR rows from an older saved segment are
 *  left untouched (they still count) but not shown as editable — this UI never creates them. */
export function SimpleFilterBuilder({ rows, setRows }: { rows: Row[]; setRows: (r: Row[]) => void }) {
  const { t } = useI18n();
  const condRows = rows.filter((r): r is Extract<Row, { t: "cond" }> => r.t === "cond");

  // Map an index within condRows back to its index in the full rows array.
  function condIndexToRowIndex(condIdx: number): number {
    let seen = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].t === "cond") {
        seen++;
        if (seen === condIdx) return i;
      }
    }
    return -1;
  }

  function addCond() {
    setRows([...rows, { t: "cond", field: "city", value: "" }]);
  }
  function updateCond(condIdx: number, row: Row) {
    const ri = condIndexToRowIndex(condIdx);
    setRows(rows.map((r, j) => (j === ri ? row : r)));
  }
  function removeCond(condIdx: number) {
    const ri = condIndexToRowIndex(condIdx);
    setRows(rows.filter((_, j) => j !== ri));
  }

  return (
    <div className="space-y-3">
      <p className="font-body text-[12px] leading-relaxed text-ink-soft">
        {t.segments.simpleIntro}
      </p>

      <div className="space-y-2">
        {condRows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-sm border border-glass-border/70 p-2">
            <select
              className={selectCls}
              value={row.field}
              onChange={(e) => {
                const f = e.target.value as LeafField;
                updateCond(i, { t: "cond", field: f, value: defaultValue(f) });
              }}
            >
              {CATEGORIES.map((f) => <option key={f} value={f}>{categoryLabel(f, t)}</option>)}
            </select>
            <span className="font-body text-[12px] text-ink-faint">{t.segments.simpleIs}</span>
            <ValueControl
              field={row.field}
              value={row.value}
              onChange={(v) => updateCond(i, { t: "cond", field: row.field, value: v })}
            />
            <button
              type="button"
              onClick={() => removeCond(i)}
              aria-label={t.segments.removeCondition}
              className="text-ink-faint hover:text-red"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {condRows.length === 0 && (
          <p className="font-body text-[12px] italic text-ink-faint">{t.segments.simpleEmpty}</p>
        )}
      </div>

      <button
        type="button"
        onClick={addCond}
        className="inline-flex items-center gap-1 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[12px] text-ink hover:opacity-80"
      >
        <Plus className="h-3.5 w-3.5" /> {t.segments.simpleAddFilter}
      </button>
    </div>
  );
}
