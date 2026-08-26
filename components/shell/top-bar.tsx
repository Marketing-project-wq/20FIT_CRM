"use client";

import { LogOut } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { LangSwitcher } from "@/components/i18n/lang-switcher";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Theme } from "@/lib/theme";

/**
 * TopBar — global controls (language, theme, signed-in user, sign-out) lifted OUT of the sidebar into
 * a translucent bar across the top of the content column (Shop-inventory redesign, K-46). Desktop only
 * (md+): on a narrow screen these controls live in the slide-in drawer instead, since the mobile top
 * strip is just brand + hamburger. Uses the --topbar token so it reads as a floating control strip over
 * the page, re-tinting with the theme. No RBAC here — purely chrome.
 */
export function TopBar({ userEmail, initialTheme }: { userEmail: string; initialTheme: Theme }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 border-b border-surface-border bg-topbar px-6 backdrop-blur-glass md:flex">
      <LangSwitcher />
      <ThemeToggle initialTheme={initialTheme} labels={{ toDark: t.nav.darkMode, toLight: t.nav.lightMode }} />
      <div className="mx-1 h-5 w-px bg-surface-border" aria-hidden />
      <span className="max-w-[16rem] truncate font-mono text-[11px] text-ink-faint" title={userEmail}>
        {userEmail}
      </span>
      <form action="/logout" method="post">
        <button
          type="submit"
          className="flex min-h-[36px] items-center gap-1.5 rounded-sm px-2.5 py-1 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t.nav.signOut}
        </button>
      </form>
    </div>
  );
}
