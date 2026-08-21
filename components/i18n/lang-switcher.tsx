"use client";

import { Languages } from "lucide-react";
import { LANG_COOKIE, LANGS, type Lang } from "@/lib/i18n";
import { useI18n } from "./lang-provider";

/**
 * Language switcher (Sprint 4B). Persists the choice in a cookie — never localStorage — so the
 * server renders the right language on the next request with no flash (identical to the theme
 * toggle). A full reload applies it everywhere, including the server-rendered surfaces (route
 * messages, CSV, AI). Indonesian is the default.
 */
const LABEL: Record<Lang, string> = { id: "ID", en: "EN" };

export function LangSwitcher() {
  const { lang, t } = useI18n();

  function setLang(next: Lang) {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Reload so every server-rendered surface picks up the new language too.
    window.location.reload();
  }

  return (
    <div className="flex w-full items-center gap-2 px-3 py-2">
      <Languages className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
      <span className="font-display text-[13px] font-bold uppercase tracking-wide text-ink-soft">{t.nav.language}</span>
      <div className="ml-auto flex items-center gap-1">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={l === lang}
            className={
              l === lang
                ? "rounded-full bg-glass px-2.5 py-1 font-display text-[12px] font-bold text-ink"
                : "rounded-full px-2.5 py-1 font-display text-[12px] font-bold text-ink-faint transition-colors hover:text-ink"
            }
          >
            {LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
