"use client";

import { createContext, useContext } from "react";
import { getDictionary, type Dict, type Lang } from "@/lib/i18n";

/**
 * Client language context (Sprint 4B). Seeded from the server (which read the cookie), so the
 * first paint is already in the right language — no flash, same pattern as the theme. Components
 * call useI18n() → { lang, t } and read the nested dictionary directly (t.dashboard.title), which
 * is fully type-checked; there is no string-key lookup to typo.
 */

interface I18nValue {
  lang: Lang;
  t: Dict;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ lang, t: getDictionary(lang) }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <LangProvider>");
  return ctx;
}
