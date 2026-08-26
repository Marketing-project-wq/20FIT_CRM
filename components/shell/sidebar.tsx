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
 * Sidebar — a LIGHT, solid rail (Shop-inventory redesign, K-46), no longer forced dark (was PRD §18.8).
 * It follows the theme: white surface in light mode, dark solid in dark mode, via the --sidebar token.
 * Responsive (BAGIAN D): a static rail on desktop (md+); on a narrow screen it collapses to a top strip
 * with a hamburger that opens the SAME nav as a slide-in drawer. The nav body is ONE component
 * (SidebarNav), rendered by both the desktop rail and the mobile drawer, so the two can't drift.
 *
 * Global controls (language, theme, user, sign-out) live in the TopBar on desktop; on mobile there is
 * no top bar for them, so the drawer carries a controls footer (SidebarControls). `activePath` overrides
 * the live pathname for dev previews.
 */

/** Theme-following brand lockup: both variants rendered, exactly one shown by the CSS in globals.css
 *  (`.logo-dark-only` hidden on light, `.logo-light-only` hidden on dark). So the colour wordmark shows
 *  on the light sidebar and the white one on the dark sidebar — no JS, flips instantly with the toggle. */
function ThemeLogo({ height, priority = false }: { height: number; priority?: boolean }) {
  return (
    <>
      <span className="logo-light-only inline-flex">
        <BrandLogo variant="color" height={height} priority={priority} />
      </span>
      <span className="logo-dark-only inline-flex">
        <BrandLogo variant="white" height={height} priority={priority} />
      </span>
    </>
  );
}

function SidebarNav({
  items,
  isActive,
  onNavigate,
}: {
  items: typeof NAV_ITEMS;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
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
              active ? "bg-red text-white" : "text-ink-soft hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{navLabel(t, item.href, item.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Controls footer — only the mobile drawer renders this (desktop uses the TopBar). */
function SidebarControls({ initialTheme, userEmail }: { initialTheme: Theme; userEmail: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 border-t border-sidebar-border p-3">
      <LangSwitcher />
      <ThemeToggle initialTheme={initialTheme} />
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="min-w-0 truncate font-mono text-[11px] text-ink-faint" title={userEmail}>
          {userEmail}
        </span>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t.nav.signOut}
          </button>
        </form>
      </div>
    </div>
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
      {/* Desktop rail (md+) — light solid surface, nav only (controls live in the TopBar). */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center px-5">
          <ThemeLogo height={28} priority />
        </div>
        <SidebarNav items={items} isActive={isActive} />
      </aside>

      {/* Mobile top strip (below md) — brand + hamburger, on the translucent topbar surface. */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-surface-border bg-topbar px-4 backdrop-blur-glass md:hidden">
        <button
          type="button"
          aria-label={t.tabs.menu}
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
        >
          <Menu className="h-5 w-5" />
        </button>
        <ThemeLogo height={24} />
      </div>

      {/* Mobile drawer + backdrop — nav + controls footer. */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex h-14 items-center justify-between px-4">
              <ThemeLogo height={24} />
              <button
                type="button"
                aria-label="close menu"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarNav items={items} isActive={isActive} onNavigate={() => setOpen(false)} />
            <SidebarControls initialTheme={initialTheme} userEmail={userEmail} />
          </aside>
        </div>
      )}
    </>
  );
}
