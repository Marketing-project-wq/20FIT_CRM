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

export type NavItem = { label: string; href: string; icon: LucideIcon };

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
