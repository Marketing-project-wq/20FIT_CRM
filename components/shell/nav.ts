import {
  LayoutDashboard,
  Users,
  GitBranch,
  Megaphone,
  FileText,
  Settings,
  BarChart3,
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
    "/templates": t.nav.templates,
    "/campaigns": t.nav.campaigns,
    "/workflows": t.nav.workflows,
    "/analytics/events": t.nav.eventAnalysis,
    "/settings": t.nav.settings,
  };
  return map[href] ?? fallback;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Audience", href: "/audience", icon: Users },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Workflows", href: "/workflows", icon: GitBranch },
  { label: "Event Analysis", href: "/analytics/events", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];
