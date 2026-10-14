import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { c360Live } from "@/lib/c360";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Customer 360° | 20FIT CRM" };
export const dynamic = "force-dynamic";

/**
 * Customer 360° = the same dashboard as admin.20fit.id/data (one source of truth for customer LTV):
 * the c360-api UI shown in an iframe through the session-gated proxy /api/c360/ui. `noexport` hides the
 * CSV button (the proxy refuses export anyway — the CRM has no data-exit path).
 * Needs the FULL profile-list grant: the dashboard shows unmasked contact data.
 */
export default async function Customer360Page() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (grantFor(role, "profile.view_list") !== "allow") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          {t.nav.customer360}
        </h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-surface-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {t.access.audienceDeniedRole}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
          {t.nav.customer360}
        </h1>
        <a
          href="https://admin.20fit.id/data"
          target="_blank"
          rel="noopener noreferrer"
          className="font-body text-[13px] text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          admin.20fit.id/data ↗
        </a>
      </div>
      {c360Live() ? (
        <iframe
          src="/api/c360/ui?embed=1&noexport=1"
          title="Customer 360° 20FIT"
          allow="fullscreen"
          allowFullScreen
          className="w-full rounded-card border border-surface-border bg-white"
          style={{ height: "calc(100dvh - 190px)", minHeight: 640 }}
        />
      ) : (
        <div className="rounded-card border border-dashed border-surface-border px-6 py-20 text-center font-body text-[14px] text-ink-soft">
          C360_API_URL / C360_API_TOKEN belum di-set di service CRM.
        </div>
      )}
    </div>
  );
}
