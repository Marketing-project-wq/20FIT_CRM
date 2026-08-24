import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { realSendEnabled } from "@/lib/crm/send-gate";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

/**
 * Campaigns — the send console. Gate: send.* != deny (same as nav).
 *
 * The compose-and-send FORM is intentionally not wired live yet: it depends on saved segments
 * (RENCANA-simpan-segmen, not built) and on the two blocking send prerequisites (token rotation +
 * DNS). Rather than ship an un-runnable "send" button, this console surfaces the flow, the limits,
 * and — front and centre — the pre-launch block, which is ALSO enforced in code (send-gate). The
 * send PATH behind it is built and unit-tested (lib/crm/send-run.ts + send-campaign.ts).
 */
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
  const admin = createAdminClient();
  let activeTemplates = 0;
  try {
    const { count } = await admin
      .from("crm_message_template")
      .select("id", { count: "exact", head: true })
      .eq("channel", "email")
      .eq("is_active", true);
    activeTemplates = count ?? 0;
  } catch {
    activeTemplates = 0;
  }

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
          <p className="mt-4 font-body text-[13px] text-ink-soft">
            {c.templatesActive}: <span className="font-mono text-ink">{activeTemplates}</span>
          </p>
          {activeTemplates === 0 && (
            <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-faint">{c.templatesNone}</p>
          )}
        </div>
      </div>

      <div className="rounded-card border border-dashed border-glass-border p-5">
        <p className="font-body text-[13px] font-semibold text-ink">{c.pendingTitle}</p>
        <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft">{c.pendingBody}</p>
      </div>
    </div>
  );
}
