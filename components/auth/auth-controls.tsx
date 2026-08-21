"use client";

import { LangSwitcher } from "@/components/i18n/lang-switcher";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Theme } from "@/lib/theme";

/**
 * Language + theme controls for the pre-auth pages — a centred bar the WIDTH OF THE CARD, sitting
 * just above it (not floating in a corner), so it reads as part of the form column.
 *
 * A layout wrapper, not a new system: it reuses `LangSwitcher` (cookie + reload) and `ThemeToggle`
 * (cookie + `data-theme` flip) verbatim. Both are full-width rows, so each is given half the bar
 * (`flex-1`) and their `w-full` fills that half — the two sit side by side. `ThemeToggle`'s labels
 * are passed in translated (its defaults are the sidebar's Indonesian text, unchanged).
 */
export function AuthControls({ initialTheme }: { initialTheme: Theme }) {
  const { t } = useI18n();
  return (
    <div className="glass mb-4 flex items-stretch gap-1 p-1">
      <div className="flex-1">
        <LangSwitcher />
      </div>
      <div className="w-px shrink-0 self-stretch bg-glass-border" />
      <div className="flex-1">
        <ThemeToggle
          initialTheme={initialTheme}
          labels={{ toDark: t.auth.themeDark, toLight: t.auth.themeLight }}
        />
      </div>
    </div>
  );
}
