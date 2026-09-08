"use client";

import { useState } from "react";
import { Users, Mail, Phone, Zap, Trophy, Dumbbell, Calendar, Heart, Star } from "lucide-react";
import type { SegmentCriteria } from "@/lib/crm/segment";
import { EMPTY_CRITERIA } from "@/lib/crm/segment";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";

/** How many quick cards show before "see all". The rest are folded (kept, not removed — there is no
 *  per-card usage data in the audit trail to justify dropping any, verified 8 Sep 2026). */
const QUICK_VISIBLE = 3;

interface QuickSegmentDef {
  id: string;
  labelKey: keyof ReturnType<typeof segLabels>;
  count: number | null;
  icon: React.ReactNode;
  criteria: Partial<SegmentCriteria>;
  clinical?: boolean;
}

// Small helper so TS knows the label keys exist on t.segments.
function segLabels(t: ReturnType<typeof useI18n>["t"]) {
  return {
    quickAll: t.segments.quickAll,
    quickHasEmail: t.segments.quickHasEmail,
    quickHasPhone: t.segments.quickHasPhone,
    quickMembership: t.segments.quickMembership,
    quickEvent: t.segments.quickEvent,
    quickArena: t.segments.quickArena,
    quickMy20fit: t.segments.quickMy20fit,
    quickLoyal: t.segments.quickLoyal,
    quickClinic: t.segments.quickClinic,
  };
}

const QUICK_SEGMENTS: QuickSegmentDef[] = [
  { id: "all", labelKey: "quickAll", count: 82253, icon: <Users className="h-4 w-4" />, criteria: {} },
  { id: "has_email", labelKey: "quickHasEmail", count: 81637, icon: <Mail className="h-4 w-4" />, criteria: { hasEmail: true } },
  { id: "has_phone", labelKey: "quickHasPhone", count: 81615, icon: <Phone className="h-4 w-4" />, criteria: { hasPhone: true } },
  { id: "membership", labelKey: "quickMembership", count: 67828, icon: <Zap className="h-4 w-4" />, criteria: { ecoUnit: "membership" } },
  { id: "event", labelKey: "quickEvent", count: 18247, icon: <Calendar className="h-4 w-4" />, criteria: { ecoUnit: "event" } },
  { id: "arena", labelKey: "quickArena", count: 2075, icon: <Dumbbell className="h-4 w-4" />, criteria: { ecoUnit: "arena" } },
  { id: "my20fit", labelKey: "quickMy20fit", count: 175, icon: <Star className="h-4 w-4" />, criteria: { srcMy20fit: true } },
  { id: "loyal", labelKey: "quickLoyal", count: 63, icon: <Trophy className="h-4 w-4" />, criteria: { srcRfm: ["loyal"] } },
  { id: "clinic", labelKey: "quickClinic", count: 148, icon: <Heart className="h-4 w-4" />, criteria: { srcClinicPatient: true }, clinical: true },
];

export function QuickSegments({
  onSelect,
  canViewHealth,
}: {
  onSelect: (criteria: Partial<SegmentCriteria>) => void;
  canViewHealth: boolean;
}) {
  const { lang, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const labels = segLabels(t);
  const all = QUICK_SEGMENTS.filter((s) => !s.clinical || canViewHealth);
  const visible = expanded ? all : all.slice(0, QUICK_VISIBLE);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          {t.segments.quickStart}
        </p>
        {all.length > QUICK_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-body text-[12px] text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            {expanded ? t.segments.quickSeeLess : `${t.segments.quickSeeAll} (${all.length})`}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((seg) => {
          const desc = seg.count != null
            ? `${formatCount(seg.count, lang)} ${t.segments.quickProfilesSuffix}${seg.clinical ? ` · ${t.segments.quickClinicNote}` : ""}`
            : "";
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => onSelect({ ...EMPTY_CRITERIA, ...seg.criteria })}
              className="flex items-start gap-2 rounded-card border border-glass-border bg-glass p-3 text-left transition-colors hover:border-red hover:tint-red"
            >
              <span className="mt-0.5 shrink-0 text-ink-soft">{seg.icon}</span>
              <span className="min-w-0">
                <span className="block font-body text-[13px] font-semibold text-ink">{labels[seg.labelKey]}</span>
                <span className="block font-body text-[11px] text-ink-faint">{desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
