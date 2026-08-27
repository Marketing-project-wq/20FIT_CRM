"use client";

import { Users, Mail, Phone, Zap, Trophy, Dumbbell, Calendar, Heart, Star } from "lucide-react";
import type { SegmentCriteria } from "@/lib/crm/segment";
import { EMPTY_CRITERIA } from "@/lib/crm/segment";

export interface QuickSegment {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  criteria: Partial<SegmentCriteria>;
  clinical?: boolean;
}

export const QUICK_SEGMENTS: QuickSegment[] = [
  {
    id: "all",
    label: "Semua audiens",
    description: "82.253 profil",
    icon: <Users className="h-4 w-4" />,
    criteria: {},
  },
  {
    id: "has_email",
    label: "Punya email",
    description: "81.637 profil",
    icon: <Mail className="h-4 w-4" />,
    criteria: { hasEmail: true },
  },
  {
    id: "has_phone",
    label: "Punya telepon",
    description: "81.615 profil",
    icon: <Phone className="h-4 w-4" />,
    criteria: { hasPhone: true },
  },
  {
    id: "membership",
    label: "Member Fitco",
    description: "67.828 profil",
    icon: <Zap className="h-4 w-4" />,
    criteria: { ecoUnit: "membership" },
  },
  {
    id: "event",
    label: "Pernah event",
    description: "18.247 profil",
    icon: <Calendar className="h-4 w-4" />,
    criteria: { ecoUnit: "event" },
  },
  {
    id: "arena",
    label: "Pernah arena",
    description: "2.075 profil",
    icon: <Dumbbell className="h-4 w-4" />,
    criteria: { ecoUnit: "arena" },
  },
  {
    id: "my20fit",
    label: "Pengguna My20FIT",
    description: "175 profil",
    icon: <Star className="h-4 w-4" />,
    criteria: { srcMy20fit: true },
  },
  {
    id: "loyal",
    label: "Pelanggan setia",
    description: "63 profil",
    icon: <Trophy className="h-4 w-4" />,
    criteria: { srcRfm: "loyal" },
  },
  {
    id: "clinic",
    label: "Pasien klinik",
    description: "148 profil · butuh izin kesehatan",
    icon: <Heart className="h-4 w-4" />,
    criteria: { srcClinicPatient: true },
    clinical: true,
  },
];

export function QuickSegments({
  onSelect,
  canViewHealth,
}: {
  onSelect: (criteria: Partial<SegmentCriteria>) => void;
  canViewHealth: boolean;
}) {
  const visible = QUICK_SEGMENTS.filter((s) => !s.clinical || canViewHealth);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        Mulai dari sini
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((seg) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => onSelect({ ...EMPTY_CRITERIA, ...seg.criteria })}
            className="flex items-start gap-2 rounded-card border border-glass-border bg-glass p-3 text-left transition-colors hover:border-red hover:tint-red"
          >
            <span className="mt-0.5 shrink-0 text-ink-soft">{seg.icon}</span>
            <span className="min-w-0">
              <span className="block font-body text-[13px] font-semibold text-ink">{seg.label}</span>
              <span className="block font-body text-[11px] text-ink-faint">{seg.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
