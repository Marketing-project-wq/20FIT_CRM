import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { RolesPanel } from "@/components/settings/roles-panel";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Roles" };

// Role-dependent — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Focused RBAC roles page. Same gate (audit.view) and same panel as the /settings hub
 * — this route is the deep link; /settings is the coherent overview. Neither
 * duplicates the other's loading logic (see components/settings/roles-panel.tsx).
 */
export default async function RolesPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!isPermitted(role, "audit.view")) {
    const decision = resolveGrant(role, "audit.view");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Roles</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? t.access.segmentsDeniedScope
              : t.audit.rolesPageDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Roles</h1>
        <Link
          href="/settings"
          className="font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          {t.audit.allSettingsLink}
        </Link>
      </div>
      <RolesPanel />
    </div>
  );
}
