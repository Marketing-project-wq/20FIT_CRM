import {
  LayoutDashboard,
  Users,
  GitBranch,
  Megaphone,
  FileText,
  Download,
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
    "/exports": t.nav.exports,
    "/settings": t.nav.settings,
  };
  return map[href] ?? fallback;
}

/**
 * Sidebar navigation — SEVEN menus (nav rebuild, was eleven). The four dropped screens moved INTO
 * these, not away: Segments → the shared builder in Campaigns + Exports; Messages → a Templates tab;
 * Consent → the unsubscribe tab in Audience + the consent-basis archive in Settings; Quality → a tab
 * in Audience. The old routes redirect to their new home, so no bookmark 404s.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Audience", href: "/audience", icon: Users },
  { label: "Workflows", href: "/workflows", icon: GitBranch },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Exports", href: "/exports", icon: Download },
  { label: "Settings", href: "/settings", icon: Settings },
];
