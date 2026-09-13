"use client";

import { ThemeToggle } from "./theme-toggle";
import { LangSwitcher } from "@/components/i18n/lang-switcher";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Theme } from "@/lib/theme";

export function TopBar({ initialTheme }: { initialTheme: Theme }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-2 border-b border-surface-border bg-topbar px-6 backdrop-blur-glass md:flex">
      <LangSwitcher />
      <ThemeToggle initialTheme={initialTheme} labels={{ toDark: t.nav.darkMode, toLight: t.nav.lightMode }} />
    </div>
  );
}
