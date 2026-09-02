import { LangProvider } from "@/components/i18n/lang-provider";
import { DevBanner } from "@/components/dev/dev-banner";
import { SegmentMultiPreview } from "./preview-client";

export const dynamic = "force-dynamic";

/**
 * Dev-only FIXTURE for multi-select program/RFM segment criteria (K-52). /dev/* is 404 in production.
 * Renders the REAL UnifiedFilterBuilder with several programs + RFM tiers pre-selected so a screenshot
 * shows the chips, the "add" dropdown, and one master row (city) — light and dark, mobile and desktop.
 * No auth, no Supabase, no write.
 */
export default function Page() {
  return (
    <LangProvider lang="id">
      <div className="min-h-screen bg-surface p-6">
        <DevBanner mode="fixture" note="Kriteria program/RFM multi-nilai — data fixture, tidak ada tulisan ke database." />
        <h1 className="mt-4 font-display text-[22px] font-black text-ink">Segmen — kriteria multi-nilai (program + tingkat RFM)</h1>
        <p className="mt-1 mb-4 font-body text-[13px] text-ink-soft">
          Program: Half + Double + RUNFEST 5K (OR di dalam kriteria). Tingkat: Loyal + New (OR). Kota Jakarta (AND antar-kriteria).
        </p>
        <SegmentMultiPreview />
      </div>
    </LangProvider>
  );
}
