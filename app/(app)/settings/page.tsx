import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant, canManageRoles } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { RolesPanel } from "@/components/settings/roles-panel";
import { RoleGrantForm } from "@/components/settings/role-grant-form";
import { AuditLogPanel } from "@/components/settings/audit-log-panel";
import { WhatsappPanel } from "@/components/settings/whatsapp-panel";
import { ConsentArchivePanel } from "@/components/consent/consent-archive-panel";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Settings" };

// Role-dependent — never statically cached.
export const dynamic = "force-dynamic";

const TAB_KEYS = ["log", "manager", "consent", "whatsapp"] as const;
type SettingsTab = (typeof TAB_KEYS)[number];

function resolveTab(raw: string | string[] | undefined): SettingsTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (TAB_KEYS as readonly string[]).includes(v ?? "") ? (v as SettingsTab) : "log";
}

/**
 * Settings hub — FOUR TABS (FINAL TUGAS 2), same query-param TabBar as Audience / Templates (one host
 * route, bookmarkable, mobile-reachable — no new tab pattern, LARANGAN):
 *   - CRM Log            → the audit trail (AuditLogPanel)
 *   - 20FIT Manager      → CRM roles: who has access + grant/change/revoke (RolesPanel + form)
 *   - Consent            → the read-only consent-basis archive (ConsentArchivePanel), honesty notes intact
 *   - WhatsApp Business API → connection status (WhatsappPanel)
 *
 * The whole page is gated on audit.view (super_admin, crm_manager) — the same as canSeeNav("/settings").
 * Fail-closed: a role without it sees a denial, not an empty page. Role MANAGEMENT inside 20FIT Manager
 * is further gated on canManageRoles (super_admin only); the server action re-checks regardless.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
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
            {decision === "needs_scope" ? t.access.segmentsDeniedScope : t.audit.pageDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  const tab = resolveTab(searchParams?.tab);
  const canSeeConsentArchive = isPermitted(role, "consent.edit");

  const tabs: TabDef[] = [
    { key: "log", label: t.tabs.settingsLog, href: "/settings?tab=log" },
    { key: "manager", label: t.tabs.settingsManager, href: "/settings?tab=manager" },
    { key: "consent", label: t.tabs.settingsConsent, href: "/settings?tab=consent" },
    { key: "whatsapp", label: t.tabs.settingsWhatsapp, href: "/settings?tab=whatsapp" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            {t.audit.settingsTitle}
          </h1>
          <p className="mt-2 max-w-2xl font-body text-[14px] text-ink-soft">{t.audit.settingsSubtitle}</p>
        </div>
        <Link
          href="/settings/diagnostik"
          className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-glass-border px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass hover:text-ink"
        >
          <Stethoscope className="h-4 w-4" /> {t.audit.diagnostikLink}
        </Link>
      </header>

      <TabBar tabs={tabs} active={tab} />

      {tab === "log" && (
        <div className="space-y-6">
          <CoverageNotice screen="audit" />
          <AuditLogPanel />
        </div>
      )}

      {tab === "manager" && (
        <div className="space-y-6">
          <RolesPanel />
          {/* Role administration is SUPER-ADMIN EXCLUSIVE (K-43). CRM Manager sees the list (audit.view)
              but NOT this form; the server action re-checks canManageRoles regardless. */}
          {canManageRoles(role) && <RoleGrantForm />}
        </div>
      )}

      {tab === "consent" && (
        <div className="space-y-6">
          {canSeeConsentArchive ? (
            <>
              <CoverageNotice screen="consent" />
              <ConsentArchivePanel />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
              <Badge tone="red">{t.access.deniedBadge}</Badge>
              <p className="max-w-md font-body text-[13px] leading-relaxed text-ink-soft">
                {t.audit.pageDeniedRole}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "whatsapp" && <WhatsappPanel />}
    </div>
  );
}
