import {
  LayoutDashboard,
  Users,
  Filter,
  GitBranch,
  Megaphone,
  FileText,
  MessageSquare,
  ShieldCheck,
  ListChecks,
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
    "/segments": t.nav.segments,
    "/workflows": t.nav.workflows,
    "/campaigns": t.nav.campaigns,
    "/templates": t.nav.templates,
    "/messages": t.nav.messages,
    "/consent": t.nav.consent,
    "/quality": t.nav.quality,
    "/exports": t.nav.exports,
    "/settings": t.nav.settings,
  };
  return map[href] ?? fallback;
}

/** Sidebar navigation — routes mirror PRD §18.7 Screen Inventory. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Audience", href: "/audience", icon: Users },
  { label: "Segments", href: "/segments", icon: Filter },
  { label: "Workflows", href: "/workflows", icon: GitBranch },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Consent", href: "/consent", icon: ShieldCheck },
  { label: "Quality", href: "/quality", icon: ListChecks },
  { label: "Exports", href: "/exports", icon: Download },
  { label: "Settings", href: "/settings", icon: Settings },
];
