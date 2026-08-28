"use client";

import { Plus, X } from "lucide-react";
import { type LeafField } from "@/lib/crm/filter-tree";
import { AUDIENCE_UNITS, AUDIENCE_SEGMENTS, SEGMENT_NULL } from "@/lib/crm/audience-constants";
import { ECOSYSTEM_UNITS, ECOSYSTEM_PRODUCTS_BY_UNIT } from "@/lib/crm/engagement-constants";
import { STAGING_RFM_VALUES, STAGING_PROGRAMS } from "@/lib/crm/staging-constants";
import { type SegmentCriteria } from "@/lib/crm/segment";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Row } from "@/components/segments/filter-tree-builder";

/**
 * ONE unified condition list (Mailchimp-style). Every audience condition — contact, demographic,
 * and participation/behaviour — is added from a SINGLE grouped dropdown, one row each, all AND'd.
 * This replaces the old three separate sections (Kontak / Demografi / Perilaku) that confused users
 * (clicking "has email" secretly added a row elsewhere).
 *
 * Two backing stores, unchanged from before — this component only unifies the UI over them:
 *  - master fields (city/unit/segment/revenue/hasEmail/hasPhone) → filter-tree rows (Row[])
 *  - everything else (ecoUnit/ecoProduct/srcHyrox/…/srcRfm/srcProgram) → SegmentCriteria fields
 * No data-layer / API / compute change: each condition maps to the exact field it always did.
 */

const selectCls =
  "h-9 rounded-sm border border-glass-border bg-glass px-2 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

// Every category key the unified dropdown offers. Prefixed by store: `m:` = master tree field,
// `c:` = criteria field. Clinical ones are only listed when canViewHealth.
type CatKey =
  | "m:city" | "m:unit" | "m:segment" | "m:revenue" | "m:hasEmail" | "m:hasPhone"
  | "c:ecoUnit" | "c:ecoProduct" | "c:srcHyrox" | "c:srcMy20fit" | "c:srcRecency"
  | "c:srcArena" | "c:srcGym" | "c:srcClinicPatient" | "c:srcClinicTxn" | "c:srcRfm" | "c:srcProgram";

export function UnifiedFilterBuilder({
  rows, setRows, criteria, setCriterion, canViewHealth,
}: {
  rows: Row[];
  setRows: (r: Row[]) => void;
  criteria: SegmentCriteria;
  setCriterion: <K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) => void;
  canViewHealth: boolean;
}) {
  const { t } = useI18n();
  const s = t.segments;

  // ── Master (tree) condition rows: only the flat cond rows are editable here. ──
  const condRows = rows.filter((r): r is Extract<Row, { t: "cond" }> => r.t === "cond");
  const condToRowIdx = (ci: number): number => {
    let seen = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].t === "cond") { seen++; if (seen === ci) return i; }
    }
    return -1;
  };
  const masterDefault = (f: LeafField): string =>
    f === "unit" ? AUDIENCE_UNITS[0] : f === "segment" ? AUDIENCE_SEGMENTS[0] : f === "revenue" ? "has" : "";
  const addMasterRow = (f: LeafField) => setRows([...rows, { t: "cond", field: f, value: masterDefault(f) }]);
  const updateMasterRow = (ci: number, r: Row) => setRows(rows.map((x, j) => (j === condToRowIdx(ci) ? r : x)));
  const removeMasterRow = (ci: number) => setRows(rows.filter((_, j) => j !== condToRowIdx(ci)));

  // ── Which criteria fields are currently active (shown as rows). ──
  const activeCriteria: CatKey[] = [];
  if (criteria.ecoUnit) activeCriteria.push("c:ecoUnit");
  if (criteria.ecoProduct) activeCriteria.push("c:ecoProduct");
  if (criteria.srcHyrox) activeCriteria.push("c:srcHyrox");
  if (criteria.srcMy20fit) activeCriteria.push("c:srcMy20fit");
  if (criteria.srcRecency) activeCriteria.push("c:srcRecency");
  if (criteria.srcArena) activeCriteria.push("c:srcArena");
  if (criteria.srcGym) activeCriteria.push("c:srcGym");
  if (criteria.srcClinicPatient) activeCriteria.push("c:srcClinicPatient");
  if (criteria.srcClinicTxn) activeCriteria.push("c:srcClinicTxn");
  if (criteria.srcRfm) activeCriteria.push("c:srcRfm");
  if (criteria.srcProgram) activeCriteria.push("c:srcProgram");

  function addCategory(key: CatKey) {
    if (key.startsWith("m:")) {
      addMasterRow(key.slice(2) as LeafField);
      return;
    }
    const field = key.slice(2) as keyof SegmentCriteria;
    // Toggle-style criteria default to "on"; value criteria get their first option.
    if (field === "ecoUnit") setCriterion("ecoUnit", ECOSYSTEM_UNITS[0]);
    else if (field === "ecoProduct") setCriterion("ecoProduct", ECOSYSTEM_PRODUCTS_BY_UNIT[ECOSYSTEM_UNITS[0]][0]);
    else if (field === "srcRfm") setCriterion("srcRfm", STAGING_RFM_VALUES[0]);
    else if (field === "srcProgram") setCriterion("srcProgram", STAGING_PROGRAMS.find((p) => !p.clinical)!.key);
    else setCriterion(field, true as never);
  }

  function removeCriterion(key: CatKey) {
    const field = key.slice(2) as keyof SegmentCriteria;
    if (field === "ecoUnit" || field === "ecoProduct" || field === "srcRfm" || field === "srcProgram") {
      setCriterion(field, null as never);
    } else {
      setCriterion(field, false as never);
    }
  }

  // Label for a category key (for the "add" dropdown and the row label).
  const catLabel = (key: CatKey): string => {
    const map: Record<CatKey, string> = {
      "m:city": s.fieldCity, "m:unit": s.fieldUnit, "m:segment": s.fieldSegment, "m:revenue": s.fieldRevenue,
      "m:hasEmail": s.kontakHasEmail, "m:hasPhone": s.kontakHasPhone,
      "c:ecoUnit": s.ecoUnitLabel, "c:ecoProduct": s.ecoProductLabel,
      "c:srcHyrox": s.srcHyroxLabel, "c:srcMy20fit": s.srcMy20fitLabel, "c:srcRecency": s.srcRecencyLabel,
      "c:srcArena": s.srcArenaLabel, "c:srcGym": s.srcGymLabel,
      "c:srcClinicPatient": s.srcClinicPatientLabel, "c:srcClinicTxn": s.srcClinicTxnLabel,
      "c:srcRfm": s.rfmLabel, "c:srcProgram": s.programLabel,
    };
    return map[key];
  };

  return (
    <div className="space-y-3">
      <p className="font-body text-[12px] leading-relaxed text-ink-soft">{s.unifiedIntro}</p>

      <div className="space-y-2">
        {/* Master (tree) rows */}
        {condRows.map((row, i) => (
          <div key={`m${i}`} className="flex flex-wrap items-center gap-2 rounded-sm border border-glass-border/70 p-2">
            <span className="font-body text-[13px] font-medium text-ink">{catLabel(`m:${row.field}` as CatKey)}</span>
            <span className="font-body text-[12px] text-ink-faint">{s.simpleIs}</span>
            {row.field === "hasEmail" || row.field === "hasPhone" ? (
              <span className="font-body text-[13px] text-ink">{s.unifiedYes}</span>
            ) : (
              <MasterValue field={row.field} value={row.value} onChange={(v) => updateMasterRow(i, { t: "cond", field: row.field, value: v })} />
            )}
            <button type="button" onClick={() => removeMasterRow(i)} aria-label={s.removeCondition} className="ml-auto text-ink-faint hover:text-red">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Criteria rows */}
        {activeCriteria.map((key) => (
          <div key={key} className="flex flex-wrap items-center gap-2 rounded-sm border border-glass-border/70 p-2">
            <span className="font-body text-[13px] font-medium text-ink">{catLabel(key)}</span>
            <span className="font-body text-[12px] text-ink-faint">{s.simpleIs}</span>
            <CriterionValue keyName={key} criteria={criteria} setCriterion={setCriterion} canViewHealth={canViewHealth} />
            <button type="button" onClick={() => removeCriterion(key)} aria-label={s.removeCondition} className="ml-auto text-ink-faint hover:text-red">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {condRows.length === 0 && activeCriteria.length === 0 && (
          <p className="font-body text-[12px] italic text-ink-faint">{s.simpleEmpty}</p>
        )}
      </div>

      {/* One grouped "add condition" dropdown */}
      <AddConditionSelect canViewHealth={canViewHealth} onAdd={addCategory} />
    </div>
  );
}

function MasterValue({ field, value, onChange }: { field: LeafField; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  if (field === "unit") return <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>{AUDIENCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>;
  if (field === "segment") return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {AUDIENCE_SEGMENTS.map((sg) => <option key={sg} value={sg}>{sg}</option>)}
      <option value={SEGMENT_NULL}>{t.segments.noSegmentOption}</option>
    </select>
  );
  if (field === "revenue") return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="has">{t.segments.revHas}</option>
      <option value="none">{t.segments.revNone}</option>
      <option value="negative">{t.segments.revNegative}</option>
    </select>
  );
  return <input className={`${selectCls} placeholder:text-ink-faint`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={t.segments.cityInputPlaceholder} />;
}

function CriterionValue({
  keyName, criteria, setCriterion, canViewHealth,
}: {
  keyName: CatKey;
  criteria: SegmentCriteria;
  setCriterion: <K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) => void;
  canViewHealth: boolean;
}) {
  const { t } = useI18n();
  if (keyName === "c:ecoUnit") return (
    <select className={selectCls} value={criteria.ecoUnit ?? ""} onChange={(e) => setCriterion("ecoUnit", e.target.value || null)}>
      {ECOSYSTEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
  if (keyName === "c:ecoProduct") return (
    <select className={selectCls} value={criteria.ecoProduct ?? ""} onChange={(e) => setCriterion("ecoProduct", e.target.value || null)}>
      {ECOSYSTEM_UNITS.map((u) => (
        <optgroup key={u} label={u}>{ECOSYSTEM_PRODUCTS_BY_UNIT[u].map((p) => <option key={p} value={p}>{p}</option>)}</optgroup>
      ))}
    </select>
  );
  if (keyName === "c:srcRfm") return (
    <select className={selectCls} value={criteria.srcRfm ?? ""} onChange={(e) => setCriterion("srcRfm", e.target.value || null)}>
      {STAGING_RFM_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
  if (keyName === "c:srcProgram") return (
    <select className={selectCls} value={criteria.srcProgram ?? ""} onChange={(e) => setCriterion("srcProgram", e.target.value || null)}>
      <optgroup label={t.segments.programGroupNonClinical}>
        {STAGING_PROGRAMS.filter((p) => !p.clinical).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </optgroup>
      {canViewHealth && (
        <optgroup label={t.segments.programGroupClinical}>
          {STAGING_PROGRAMS.filter((p) => p.clinical).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </optgroup>
      )}
    </select>
  );
  // Boolean presence criteria — just show "ya".
  return <span className="font-body text-[13px] text-ink">{t.segments.unifiedYes}</span>;
}

function AddConditionSelect({ canViewHealth, onAdd }: { canViewHealth: boolean; onAdd: (k: CatKey) => void }) {
  const { t } = useI18n();
  const s = t.segments;
  return (
    <div className="flex items-center gap-2">
      <Plus className="h-3.5 w-3.5 text-ink-soft" aria-hidden />
      <select
        className={selectCls}
        value=""
        onChange={(e) => { if (e.target.value) onAdd(e.target.value as CatKey); e.target.value = ""; }}
      >
        <option value="">{s.unifiedAdd}</option>
        <optgroup label={s.groupKontak}>
          <option value="m:hasEmail">{s.kontakHasEmail}</option>
          <option value="m:hasPhone">{s.kontakHasPhone}</option>
        </optgroup>
        <optgroup label={s.groupDemografi}>
          <option value="m:city">{s.fieldCity}</option>
          <option value="m:unit">{s.fieldUnit}</option>
          <option value="m:segment">{s.fieldSegment}</option>
          <option value="m:revenue">{s.fieldRevenue}</option>
        </optgroup>
        <optgroup label={s.groupPerilaku}>
          <option value="c:ecoUnit">{s.ecoUnitLabel}</option>
          <option value="c:ecoProduct">{s.ecoProductLabel}</option>
          <option value="c:srcHyrox">{s.srcHyroxLabel}</option>
          <option value="c:srcMy20fit">{s.srcMy20fitLabel}</option>
          <option value="c:srcRecency">{s.srcRecencyLabel}</option>
          <option value="c:srcArena">{s.srcArenaLabel}</option>
          <option value="c:srcGym">{s.srcGymLabel}</option>
          <option value="c:srcRfm">{s.rfmLabel}</option>
          <option value="c:srcProgram">{s.programLabel}</option>
          {canViewHealth && <option value="c:srcClinicPatient">{s.srcClinicPatientLabel}</option>}
          {canViewHealth && <option value="c:srcClinicTxn">{s.srcClinicTxnLabel}</option>}
        </optgroup>
      </select>
    </div>
  );
}
