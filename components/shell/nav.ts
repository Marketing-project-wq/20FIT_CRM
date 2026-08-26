import {
  LayoutDashboard,
  Users,
  GitBranch,
  Megaphone,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { Dict } from "@/lib/i18n";

export type NavItem = { label: string; href: string; icon: LucideIcon };

/** Map a nav href to its dictionary label (Sprint 4B). Keeps nav labels bilingual without
 *  changing which routes exist. Falls back to the static English label for any unmapped href. */
export function navLabel(t: Dict, href: string, fallback: string): string {
  const map: Record<string, string> = {
    "/": t.nav.dashboard,
    "/audience": t.nav.audience,
    "/workflows": t.nav.workflows,
    "/campaigns": t.nav.campaigns,
    "/templates": t.nav.templates,
    "/settings": t.nav.settings,
  };
  return map[href] ?? fallback;
}

/**
 * Sidebar navigation — SIX menus (was eleven, then seven). Exports was removed entirely: CSV export
 * was the only data exit that did NOT honour unsubscribe, and the product manages audiences + sends
 * directly rather than moving data out. The criteria builder Exports hosted now lives only in
 * Campaigns; the old /exports route redirects there so no bookmark 404s. (The other dropped screens —
 * Segments, Messages, Consent, Quality — moved into Campaigns / Templates / Audience / Settings.)
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Audience", href: "/audience", icon: Users },
  { label: "Workflows", href: "/workflows", icon: GitBranch },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];
