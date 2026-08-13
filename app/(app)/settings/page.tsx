import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { RolesPanel } from "@/components/settings/roles-panel";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Settings" };

// Role-dependent — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Settings hub. One coherent page for the two governance surfaces that already exist
 * — RBAC roles and the audit log — instead of a stub that doesn't know about
 * /settings/roles. Both are gated on the SAME action, audit.view (super_admin,
 * crm_manager), which is exactly what canSeeNav("/settings") resolves to. Fail-closed:
 * a role without it sees a denial, not an empty page.
 */
export default async function SettingsPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!isPermitted(role, "audit.view")) {
    const decision = resolveGrant(role, "audit.view");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          {t.audit.settingsTitle}
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? t.access.segmentsDeniedScope
              : t.audit.pageDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          {t.audit.settingsTitle}
        </h1>
        <p className="mt-2 font-body text-[14px] text-ink-soft">
          {t.audit.settingsSubtitle}
        </p>
        <Link
          href="/settings/diagnostik"
          className="mt-4 inline-flex items-center gap-2 rounded-sm border border-glass-border px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
        >
          <Stethoscope className="h-4 w-4" /> {t.audit.diagnostikLink}
        </Link>
      </header>

      <CoverageNotice screen="audit" />
      <AuditLogPanel />
      <RolesPanel />
    </div>
  );
}
