"use client";

import { Plus, X } from "lucide-react";
import {
  describeFilterTree,
  type FilterNode,
  type LeafField,
} from "@/lib/crm/filter-tree";
import { AUDIENCE_UNITS, AUDIENCE_SEGMENTS, SEGMENT_NULL } from "@/lib/crm/audience-constants";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Dict } from "@/lib/i18n";

/**
 * AND/OR filter builder (Sprint 3P). Root is a fixed AND; each row is either ONE condition
 * or an "ATAU (OR)" group of conditions — two levels, matching filter-tree.ts's MAX_DEPTH.
 * The tree it produces is validated server-side; this UI just composes it and shows the
 * sentence back to the user (describeFilterTree) so they read what they built.
 */

export type Row =
  | { t: "cond"; field: LeafField; value: string }
  | { t: "or"; conds: { field: LeafField; value: string }[] };

const selectCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-2 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

function fieldLabel(t: Dict, field: LeafField): string {
  switch (field) {
    case "unit": return t.segments.fieldUnit;
    case "segment": return t.segments.fieldSegment;
    case "city": return t.segments.fieldCity;
    case "revenue": return t.segments.fieldRevenue;
    case "hasPhone": return t.segments.fieldHasPhone;
    case "hasEmail": return t.segments.fieldHasEmail;
    // Absence leaves exist for the dashboard contact-coverage export only; they are NOT offered in
    // the manual builder's FIELDS list below, but the switch must stay exhaustive.
    case "noPhone": return t.segments.rbNoPhone;
    case "noEmail": return t.segments.rbNoEmail;
  }
}

// hasPhone/hasEmail are NOT offered here: they moved to the dedicated "Kontak" group in the segment
// builder (contact presence is a question of its own, not a demographic attribute). They remain valid
// LeafFields (older saved segments may carry them, and the Kontak toggles add them as tree conditions —
// one source, no duplication), so fieldLabel stays exhaustive over them.
const FIELDS: LeafField[] = ["unit", "segment", "city", "revenue"];

/** Default value when a field is chosen, so the row is valid immediately. */
function defaultValue(field: LeafField): string {
  if (field === "unit") return AUDIENCE_UNITS[0];
  if (field === "segment") return AUDIENCE_SEGMENTS[0];
  if (field === "revenue") return "has";
  return ""; // city / hasPhone / hasEmail
}

/** Turn the flat UI rows into a validated-shape FilterNode tree (or null when empty). */
export function rowsToTree(rows: Row[]): FilterNode | null {
  const children: FilterNode[] = [];
  for (const row of rows) {
    if (row.t === "cond") {
      children.push({ kind: "condition", field: row.field, value: leafValue(row.field, row.value) });
    } else if (row.conds.length > 0) {
      children.push({
        kind: "group",
        op: "OR",
        children: row.conds.map((c) => ({ kind: "condition" as const, field: c.field, value: leafValue(c.field, c.value) })),
      });
    }
  }
  if (children.length === 0) return null;
  return { kind: "group", op: "AND", children };
}

function leafValue(field: LeafField, value: string): string | null {
  if (field === "hasPhone" || field === "hasEmail") return null;
  return value;
}

function ValueControl({
  field,
  value,
  onChange,
}: {
  field: LeafField;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  if (field === "hasPhone" || field === "hasEmail") return null;
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

function ConditionRow({
  field,
  value,
  onField,
  onValue,
  onRemove,
}: {
  field: LeafField;
  value: string;
  onField: (f: LeafField) => void;
  onValue: (v: string) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectCls}
        value={field}
        onChange={(e) => onField(e.target.value as LeafField)}
      >
        {FIELDS.map((f) => <option key={f} value={f}>{fieldLabel(t, f)}</option>)}
      </select>
      <ValueControl field={field} value={value} onChange={onValue} />
      <button type="button" onClick={onRemove} aria-label={t.segments.removeCondition} className="text-ink-faint hover:text-red">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function FilterTreeBuilder({ rows, setRows }: { rows: Row[]; setRows: (r: Row[]) => void }) {
  const { lang, t } = useI18n();
  const tree = rowsToTree(rows);

  function addCond() {
    setRows([...rows, { t: "cond", field: "hasEmail", value: "" }]);
  }
  function addOr() {
    setRows([...rows, { t: "or", conds: [{ field: "hasEmail", value: "" }, { field: "hasPhone", value: "" }] }]);
  }
  function update(i: number, row: Row) {
    setRows(rows.map((r, j) => (j === i ? row : r)));
  }
  function remove(i: number) {
    setRows(rows.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-3">
      <p className="font-body text-[12px] leading-relaxed text-ink-soft">
        {t.segments.treeIntro}
      </p>

      <div className="space-y-3">
        {rows.map((row, i) =>
          row.t === "cond" ? (
            <div key={i} className="rounded-sm border border-glass-border/70 p-2">
              <ConditionRow
                field={row.field}
                value={row.value}
                onField={(f) => update(i, { t: "cond", field: f, value: defaultValue(f) })}
                onValue={(v) => update(i, { t: "cond", field: row.field, value: v })}
                onRemove={() => remove(i)}
              />
            </div>
          ) : (
            <div key={i} className="rounded-sm border border-glass-border/70 p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.orGroupLabel}</span>
                <button type="button" onClick={() => remove(i)} aria-label={t.segments.removeGroup} className="text-ink-faint hover:text-red">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {row.conds.map((cond, k) => (
                  <ConditionRow
                    key={k}
                    field={cond.field}
                    value={cond.value}
                    onField={(f) =>
                      update(i, { t: "or", conds: row.conds.map((cc, kk) => (kk === k ? { field: f, value: defaultValue(f) } : cc)) })
                    }
                    onValue={(v) =>
                      update(i, { t: "or", conds: row.conds.map((cc, kk) => (kk === k ? { field: cond.field, value: v } : cc)) })
                    }
                    onRemove={() =>
                      update(i, { t: "or", conds: row.conds.filter((_, kk) => kk !== k) })
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() => update(i, { t: "or", conds: [...row.conds, { field: "hasPhone", value: "" }] })}
                  className="inline-flex items-center gap-1 font-body text-[12px] text-ink-soft hover:text-ink"
                >
                  <Plus className="h-3 w-3" /> {t.segments.addOrCondition}
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={addCond} className="inline-flex items-center gap-1 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[12px] text-ink hover:opacity-80">
          <Plus className="h-3.5 w-3.5" /> {t.segments.addCondition}
        </button>
        <button type="button" onClick={addOr} className="inline-flex items-center gap-1 rounded-sm border border-glass-border bg-glass px-3 py-1.5 font-body text-[12px] text-ink hover:opacity-80">
          <Plus className="h-3.5 w-3.5" /> {t.segments.addOrGroup}
        </button>
      </div>

      {/* Read the filter back in a sentence BEFORE trusting the number. */}
      <div className="tint-neutral rounded-sm px-3 py-2">
        <p className="font-body text-[12px] text-ink">
          <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.filterReadLabel}</span>
          {tree ? describeFilterTree(tree, true, lang) : t.segments.everyoneNoConditions}
        </p>
      </div>
    </div>
  );
}
