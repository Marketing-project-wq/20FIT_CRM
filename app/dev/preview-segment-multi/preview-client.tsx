"use client";

import { useState } from "react";
import { UnifiedFilterBuilder } from "@/components/segments/unified-filter-builder";
import { EMPTY_CRITERIA, type SegmentCriteria } from "@/lib/crm/segment";
import type { Row } from "@/components/segments/filter-tree-builder";

/**
 * Dev fixture for the MULTI-SELECT program/RFM criteria (K-52). Seeded so the screenshot shows the
 * new state directly: several programs and several RFM tiers as removable chips + the "add" dropdown,
 * alongside one master row (city) so AND-across-criteria reads visibly. No network, no DB.
 */
export function SegmentMultiPreview() {
  const [criteria, setCriteria] = useState<SegmentCriteria>({
    ...EMPTY_CRITERIA,
    srcProgram: ["sportfest_half", "sportfest_double", "runfest_5k"],
    srcRfm: ["Loyal user", "New User"],
  });
  const [rows, setRows] = useState<Row[]>([{ t: "cond", field: "city", value: "Jakarta" }]);

  const setCriterion = <K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) =>
    setCriteria((c) => ({ ...c, [k]: v }));

  return (
    <div className="max-w-2xl rounded-lg border border-glass-border bg-surface p-4">
      <UnifiedFilterBuilder
        rows={rows}
        setRows={setRows}
        criteria={criteria}
        setCriterion={setCriterion}
        canViewHealth
      />
    </div>
  );
}
