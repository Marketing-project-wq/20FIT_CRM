"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/logo";
import { NAV_ITEMS, navLabel } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { LangSwitcher } from "@/components/i18n/lang-switcher";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Theme } from "@/lib/theme";

/**
 * Sidebar — always the dark theme with the white lockup (PRD §18.8). Responsive (BAGIAN D): a static
 * rail on desktop (md+); on a narrow screen it collapses to a top bar with a hamburger that opens the
 * SAME nav as a slide-in drawer — so the menu is never a wall of links squeezed off-screen. The nav
 * body is ONE component (SidebarBody), rendered by both the desktop rail and the mobile drawer, so the
 * two can't drift. `activePath` overrides the live pathname for dev previews.
 */
function SidebarBody({
  items,
  isActive,
  initialTheme,
  userEmail,
  onNavigate,
}: {
  items: typeof NAV_ITEMS;
  isActive: (href: string) => boolean;
  initialTheme: Theme;
  userEmail: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-full px-3 py-2 font-display text-[14px] font-bold uppercase tracking-wide transition-colors",
                active ? "bg-red text-white" : "text-ink-soft hover:bg-glass hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{navLabel(t, item.href, item.label)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-glass-border p-3">
        <LangSwitcher />
        <ThemeToggle initialTheme={initialTheme} />
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="min-w-0 truncate font-mono text-[11px] text-ink-faint" title={userEmail}>
            {userEmail}
          </span>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.nav.signOut}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export function Sidebar({
  userEmail,
  initialTheme,
  activePath,
  allowedHrefs,
}: {
  userEmail: string;
  initialTheme: Theme;
  activePath?: string;
  allowedHrefs: string[];
}) {
  const livePath = usePathname();
  const pathname = activePath ?? livePath;
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const allowed = new Set(allowedHrefs);
  const items = NAV_ITEMS.filter((item) => allowed.has(item.href));
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Desktop rail (md+). */}
      <aside
        data-theme="dark"
        className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col self-start bg-[var(--bg-to)] text-ink md:flex"
      >
        <div className="flex h-16 items-center px-5">
          <BrandLogo variant="white" height={30} priority />
        </div>
        <SidebarBody items={items} isActive={isActive} initialTheme={initialTheme} userEmail={userEmail} />
      </aside>

      {/* Mobile top bar (below md). */}
      <div
        data-theme="dark"
        className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-[var(--bg-to)] px-4 text-ink md:hidden"
      >
        <button
          type="button"
          aria-label={t.tabs.menu}
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-sm text-ink-soft hover:bg-glass hover:text-ink"
        >
          <Menu className="h-5 w-5" />
        </button>
        <BrandLogo variant="white" height={26} />
      </div>

      {/* Mobile drawer + backdrop. */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside
            data-theme="dark"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[var(--bg-to)] text-ink shadow-xl"
          >
            <div className="flex h-14 items-center justify-between px-4">
              <BrandLogo variant="white" height={26} />
              <button
                type="button"
                aria-label="close menu"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-sm text-ink-soft hover:bg-glass hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarBody
              items={items}
              isActive={isActive}
              initialTheme={initialTheme}
              userEmail={userEmail}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
