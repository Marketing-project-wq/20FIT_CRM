import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { TabBar } from "@/components/shell/tab-bar";
import { realSendEnabled } from "@/lib/crm/send-gate";
import { unsubscribeHostServable } from "@/lib/crm/send-env";
import { listSegments } from "@/lib/crm/segment-store";
import { extractVariables } from "@/lib/crm/template";
import { isInternalTestTemplateKey } from "@/lib/crm/send-test-constants";
import { loadCityFill } from "@/lib/crm/city-fill";
import { listDeliveries, deliveryRecipients } from "@/lib/crm/deliveries";
import { CampaignFlow, type TemplateOption } from "./campaign-flow";
import { SegmentsTab } from "./segments-tab";
import { DeliveriesTab } from "./deliveries-tab";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

async function loadEligibleTemplates(): Promise<TemplateOption[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_message_template")
      .select("template_key, name, subject, body, version")
      .eq("channel", "email")
      .eq("is_active", true)
      .order("version", { ascending: false });
    if (error) return [];
    const seen = new Set<string>();
    const out: TemplateOption[] = [];
    for (const r of (data ?? []) as { template_key: string; name: string; subject: string | null; body: string }[]) {
      if (isInternalTestTemplateKey(r.template_key)) continue;
      if (seen.has(r.template_key)) continue;
      seen.add(r.template_key);
      if (extractVariables(`${r.subject ?? ""}\n${r.body}`).includes("unsubscribe_url")) {
        out.push({ key: r.template_key, name: r.name, subject: r.subject, body: r.body });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; run?: string }>;
}) {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();
  const c = t.campaignsPage;
  const { tab: rawTab, run: runParam } = await searchParams;
  const tab = rawTab === "segmen" ? "segmen" : rawTab === "kiriman" ? "kiriman" : "kirim";

  if (grantFor(role, "send.at_or_below_threshold") === "deny") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.campaigns}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{c.deniedRole}</p>
        </div>
      </div>
    );
  }

  const enabled = realSendEnabled();
  const canBuild = isPermitted(role, "segment.build");
  const canViewHealth = isPermitted(role, "profile.view_health");
  const [segments, templates, cityFill] = await Promise.all([
    listSegments(),
    loadEligibleTemplates(),
    canBuild ? loadCityFill() : Promise.resolve({ total: 0, cityFilled: 0, cityFillPct: 0 }),
  ]);

  const noTemplate = templates.length === 0;
  const servingHost = headers().get("host");
  const host = unsubscribeHostServable(process.env.NEXT_PUBLIC_APP_URL, servingHost);
  const hostBlocked = !host.ok;

  const tabs = [
    { key: "kirim", label: c.tabKirim, href: "/campaigns?tab=kirim" },
    { key: "segmen", label: c.tabSegmen, href: "/campaigns?tab=segmen" },
    { key: "kiriman", label: c.tabKiriman, href: "/campaigns?tab=kiriman" },
  ];

  // Deliveries tab data — the merged scheduled+run timeline, and (when a run is picked) its recipients.
  const admin = createAdminClient();
  const deliveries = tab === "kiriman" ? await listDeliveries(admin) : [];
  const deliveryDetail =
    tab === "kiriman" && runParam
      ? { runId: runParam, recipients: await deliveryRecipients(admin, runParam) }
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.campaigns}</h1>
        <p className="mt-2 font-body text-[14px] leading-relaxed text-ink-soft">{c.subtitle}</p>
      </div>

      <TabBar tabs={tabs} active={tab} />

      {/* ── TAB: KIRIM ── */}
      {tab === "kirim" && (
        <div className="flex flex-col gap-6">
          {!enabled && (
            <div className="tint-red rounded-card p-5">
              <Badge tone="red">{c.blockTitle}</Badge>
              <p className="mt-3 font-body text-[13px] leading-relaxed text-ink-soft">{c.blockBody}</p>
            </div>
          )}
          {noTemplate && (
            <div className="tint-red rounded-card p-5">
              <Badge tone="red">{c.blockNoTemplateTitle}</Badge>
              <p className="mt-3 font-body text-[13px] leading-relaxed text-ink-soft">{c.blockNoTemplateBody}</p>
            </div>
          )}
          {hostBlocked && (
            <div className="tint-red rounded-card p-5">
              <Badge tone="red">{c.blockHostTitle}</Badge>
              <p className="mt-3 font-body text-[13px] leading-relaxed text-ink-soft">{c.blockHostBody}</p>
            </div>
          )}
          <CampaignFlow
            segments={segments.map((s) => ({ id: s.id, name: s.name, requiresClinical: s.requiresClinical }))}
            templates={templates}
            realSend={enabled}
            builder={{ cityFillPct: cityFill.cityFillPct, cityFilled: cityFill.cityFilled, total: cityFill.total, canViewHealth, canBuild }}
          />
          <details className="glass-strong rounded-card p-5">
            <summary className="cursor-pointer select-none font-body text-[13px] font-semibold text-ink">{c.docsTitle}</summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h2 className="font-body text-[13px] font-semibold text-ink">{c.flowTitle}</h2>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4 font-body text-[13px] leading-relaxed text-ink-soft">
                  <li>{c.flow1}</li>
                  <li>{c.flow2}</li>
                  <li>{c.flow3}</li>
                  <li>{c.flow4}</li>
                  <li>{c.flow5}</li>
                </ol>
                <p className="mt-3 font-body text-[12px] leading-relaxed text-ink-faint">{c.suppressionNote}</p>
              </div>
              <div>
                <h2 className="font-body text-[13px] font-semibold text-ink">{c.limitsTitle}</h2>
                <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 font-body text-[13px] leading-relaxed text-ink-soft">
                  <li>{c.limit1}</li>
                  <li>{c.limit2}</li>
                  <li>{c.limit3}</li>
                </ul>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── TAB: SEGMEN ── */}
      {tab === "segmen" && (
        <SegmentsTab
          segments={segments}
          cityFillPct={cityFill.cityFillPct}
          cityFilled={cityFill.cityFilled}
          total={cityFill.total}
          canViewHealth={canViewHealth}
          canBuild={canBuild}
        />
      )}

      {/* ── TAB: KIRIMAN (deliveries — scheduled + runs, one timeline) ── */}
      {tab === "kiriman" && <DeliveriesTab deliveries={deliveries} detail={deliveryDetail} />}
    </div>
  );
}
