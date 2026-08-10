"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/logo";
import { NAV_ITEMS } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import type { Theme } from "@/lib/theme";

/**
 * Sidebar — always the dark theme with the white lockup (PRD §18.8). The active
 * item is a red pill, Barlow Condensed 700 uppercase. `activePath` overrides the
 * live pathname for dev previews.
 */
export function Sidebar({
  userEmail,
  initialTheme,
  activePath,
}: {
  userEmail: string;
  initialTheme: Theme;
  activePath?: string;
}) {
  const livePath = usePathname();
  const pathname = activePath ?? livePath;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      data-theme="dark"
      className="sticky top-0 flex h-[100dvh] w-64 shrink-0 flex-col self-start bg-[var(--bg-to)] text-ink"
    >
      <div className="flex h-16 items-center px-5">
        <BrandLogo variant="white" height={30} priority />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-full px-3 py-2 font-display text-[14px] font-bold uppercase tracking-wide transition-colors",
                active ? "bg-red text-white" : "text-ink-soft hover:bg-glass hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-glass-border p-3">
        <ThemeToggle initialTheme={initialTheme} />
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="min-w-0 truncate font-mono text-[11px] text-ink-faint" title={userEmail}>
            {userEmail}
          </span>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
