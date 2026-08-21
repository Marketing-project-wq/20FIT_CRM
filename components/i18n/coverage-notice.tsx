"use client";

import { Info } from "lucide-react";
import { useI18n } from "./lang-provider";
import { isScreenBilingual, type ScreenId } from "@/lib/i18n/coverage";

/**
 * Coverage marker (Sprint 4C). One quiet line at the top of a deep screen telling an
 * English-speaking user that this screen is still Indonesian. It renders ONLY when English is
 * selected AND the screen is not yet in BILINGUAL_SCREENS — so the moment a screen is finished and
 * added to that set, this disappears on its own, with no per-screen cleanup to forget.
 */
export function CoverageNotice({ screen }: { screen: ScreenId }) {
  const { lang, t } = useI18n();
  if (lang !== "en" || isScreenBilingual(screen)) return null;
  return (
    <div className="tint-neutral mb-4 flex items-center gap-2 rounded-sm px-3 py-2">
      <Info className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />
      <p className="font-body text-[12px] text-ink-soft">{t.coverage.notEnglishYet}</p>
    </div>
  );
}
