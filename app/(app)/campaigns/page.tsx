import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { realSendEnabled } from "@/lib/crm/send-gate";
import { listSegments } from "@/lib/crm/segment-store";
import { extractVariables } from "@/lib/crm/template";
import { isInternalTestTemplateKey } from "@/lib/crm/send-test-constants";
import { loadCityFill } from "@/lib/crm/city-fill";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { CampaignComposer, type TemplateOption } from "./campaign-composer";
import { SendTestPanel } from "./send-test-panel";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

/**
 * Campaigns — the send console + compose form (TUGAS 2). Gate: send.* != deny.
 * Templates are pre-filtered to those whose body carries {{unsubscribe_url}} — a template without
 * the link cannot even be SELECTED (the send precondition, enforced at the list, not just at send).
 */
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
      if (isInternalTestTemplateKey(r.template_key)) continue; // seeded test template — never in the real dropdown
      if (seen.has(r.template_key)) continue; // highest version per key (ordered desc)
      seen.add(r.template_key);
      if (extractVariables(`${r.subject ?? ""}\n${r.body}`).includes("unsubscribe_url")) {
        out.push({ key: r.template_key, name: r.name });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export default async function CampaignsPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();
  const c = t.campaignsPage;

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.campaigns}</h1>
        <p className="mt-2 font-body text-[14px] leading-relaxed text-ink-soft">{c.subtitle}</p>
      </div>

      {/* The single banner on this screen: the pre-launch block (also enforced in send-gate). */}
      {!enabled && (
        <div className="tint-red rounded-card p-5">
          <Badge tone="red">{c.blockTitle}</Badge>
          <p className="mt-3 font-body text-[13px] leading-relaxed text-ink-soft">{c.blockBody}</p>
        </div>
      )}

      {/* Criteria builder + AI assistant — the SAME shared SegmentBuilder as Exports (one file, two
          mount points; nav rebuild). Build + SAVE a segment here, then compose the send below from it.
          canExport=false here (Campaigns sends; Exports exports). */}
      {canBuild && (
        <>
          <CoverageNotice screen="segments" />
          <SegmentBuilder
            cityFillPct={cityFill.cityFillPct}
            cityFilled={cityFill.cityFilled}
            total={cityFill.total}
            canViewHealth={canViewHealth}
            canExport={false}
          />
        </>
      )}

      <CampaignComposer
        segments={segments.map((s) => ({ id: s.id, name: s.name, requiresClinical: s.requiresClinical }))}
        templates={templates}
        realSend={enabled}
      />

      {/* Pre-launch internal send-test harness — shown ONLY while real sending is off (it also refuses
          to run once real sending is on), so it can never be a post-launch backdoor. */}
      {!enabled && <SendTestPanel />}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-strong rounded-card p-5">
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

        <div className="glass-strong rounded-card p-5">
          <h2 className="font-body text-[13px] font-semibold text-ink">{c.limitsTitle}</h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-4 font-body text-[13px] leading-relaxed text-ink-soft">
            <li>{c.limit1}</li>
            <li>{c.limit2}</li>
            <li>{c.limit3}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
