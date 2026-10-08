import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCustomer360Analytics } from "@/lib/crm/customer-360";
import { Customer360Analysis } from "@/components/analytics/customer-360-analysis";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Customer 360° | 20FIT CRM" };
export const dynamic = "force-dynamic";

export default async function Customer360Page() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (!canViewProfileList(role)) {
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

  const admin = createAdminClient();
  const data = await fetchCustomer360Analytics(admin);

  return <Customer360Analysis data={data} />;
}
