"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * Dark-mode toggle. Flips `data-theme` on <html> (the content surface) and
 * persists the choice in a cookie — never localStorage — so the server renders
 * the right theme with no flash. The sidebar itself stays dark regardless.
 */
export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const goingDark = theme !== "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingDark ? "Aktifkan mode gelap" : "Aktifkan mode terang"}
      className="flex w-full items-center gap-3 rounded-full px-3 py-2 font-display text-[13px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
    >
      {goingDark ? <Moon className="h-4 w-4 shrink-0" /> : <Sun className="h-4 w-4 shrink-0" />}
      <span>{goingDark ? "Mode gelap" : "Mode terang"}</span>
    </button>
  );
}
