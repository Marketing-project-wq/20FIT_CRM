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
import { deliveryDetail } from "@/lib/crm/deliveries";
import { listDrafts } from "@/lib/crm/campaign-draft-store";
import { CAMPAIGN_COMPOSE_TAB } from "@/lib/crm/campaign-nav";
import { CampaignFlow, type TemplateOption } from "./campaign-flow";
import { SegmentsTab } from "./segments-tab";
import { DeliveriesTab } from "./deliveries-tab";
import { AgentMailTab } from "./agent-mail-tab";
import { isAgentMailTemplateKey } from "@/lib/crm/agent-mail/guide";
import { agentMailSecret } from "@/lib/crm/agent-mail/token";
import { deliveriesCached, tagVocabCached } from "@/lib/crm/cached-loaders";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

async function loadEligibleTemplates(): Promise<TemplateOption[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_message_template")
      .select("template_key, name, display_name, subject, body, version")
      .eq("channel", "email")
      .eq("is_active", true)
      .order("version", { ascending: false });
    if (error) return [];
    const seen = new Set<string>();
    const out: TemplateOption[] = [];
    for (const r of (data ?? []) as { template_key: string; name: string; display_name: string | null; subject: string | null; body: string }[]) {
      if (isInternalTestTemplateKey(r.template_key)) continue;
      if (seen.has(r.template_key)) continue;
      seen.add(r.template_key);
      if (extractVariables(`${r.subject ?? ""}\n${r.body}`).includes("unsubscribe_url")) {
        out.push({ key: r.template_key, name: r.display_name || r.name, subject: r.subject, body: r.body });
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
  searchParams: Promise<{ tab?: string; run?: string; returnTo?: string }>;
}) {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();
  const c = t.campaignsPage;
  const { tab: rawTab, run: runParam, returnTo: returnToParam } = await searchParams;
  // Default = the Kampanye list (campaigns + performance, like the Mailtrap-style blast list); the
  // composer is "Buat kampanye" (tab=kirim), Agent Mail is tab=agent.
  const tab = rawTab === "segmen" ? "segmen" : rawTab === "kirim" ? "kirim" : rawTab === "agent" ? "agent" : "kiriman";
  // Only the composer sets this; it drives the "back to campaign" affordance in the Segmen tab.
  const returnTo = returnToParam === CAMPAIGN_COMPOSE_TAB ? CAMPAIGN_COMPOSE_TAB : null;

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
    { key: "kiriman", label: c.tabKiriman, href: "/campaigns?tab=kiriman" },
    { key: "kirim", label: c.tabKirim, href: "/campaigns?tab=kirim" },
    { key: "agent", label: c.tabAgent, href: "/campaigns?tab=agent" },
    { key: "segmen", label: c.tabSegmen, href: "/campaigns?tab=segmen" },
  ];

  // Deliveries tab data — the merged scheduled+run timeline, and (when a run is picked) its recipients.
  const admin = createAdminClient();
  const detailRequested = tab === "kiriman" && !!runParam;
  // The run list (≈9 head-counts per run) is a shared aggregate — cached 30 s, refreshed in the
  // background, dropped on every send/schedule/stop (lib/crm/server-cache.ts).
  const loadDeliveries = () => deliveriesCached(admin);
  const [deliveries, drafts] = tab === "kiriman" && !detailRequested
    ? await Promise.all([loadDeliveries(), listDrafts()])
    : [[], []];
  const detail = detailRequested ? await deliveryDetail(admin, runParam!) : null;
  // Agent Mail tab: only the campaigns an agent created (template key prefix), newest first.
  const agentRows =
    tab === "agent" ? (await loadDeliveries()).filter((r) => r.kind === "run" && isAgentMailTemplateKey(r.templateKey)) : [];
  const mcpUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://crm.20fit.id").replace(/\/+$/, "")}/api/mcp`;

  // The pool's operator-tag vocabulary for the segment builder's tag picker (TUGAS D). Fetched only
  // on the Segmen tab for a builder. Degrades to [] on a read error — the picker simply hides; a
  // failed vocab read must not crash the whole campaigns page (the AI route, which needs it to be
  // complete, fails loud separately).
  const tagVocab =
    canBuild && tab === "segmen"
      ? await tagVocabCached(admin).catch(() => ({ entries: [], namespacePeople: {} }))
      : { entries: [], namespacePeople: {} };

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
          tagVocab={tagVocab}
          returnTo={returnTo}
        />
      )}

      {/* ── TAB: AGENT MAIL (AI agent over MCP) ── */}
      {tab === "agent" && (
        <AgentMailTab
          rows={agentRows}
          canIssue={grantFor(role, "send.at_or_below_threshold") === "allow"}
          configured={agentMailSecret() !== ""}
          mcpUrl={mcpUrl}
        />
      )}

      {/* ── TAB: KIRIMAN (deliveries — scheduled + runs, one timeline) ── */}
      {tab === "kiriman" && <DeliveriesTab deliveries={deliveries} detail={detail} detailRequested={detailRequested} drafts={drafts} />}
    </div>
  );
}
