import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { ComingSoon } from "@/components/shell/coming-soon";
import { SendHistoryPanel } from "@/components/messages/send-history-panel";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

type TemplatesTab = "template" | "history";

/**
 * Templates — message templates and the send history (crm_message_log), now ONE screen with two tabs
 * (nav rebuild 11→7): Template composes, Send History records. Send History moved from the old
 * /messages screen. Gate mirrors the nav (workflow.create != deny); the History tab additionally
 * needs send.* (the old /messages gate), so a role that may author templates but not send sees only
 * the Template tab.
 */
export default async function TemplatesPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (grantFor(role, "workflow.create") === "deny") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.templates}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{t.access.templatesDeniedRole}</p>
        </div>
      </div>
    );
  }

  const canHistory = grantFor(role, "send.at_or_below_threshold") !== "deny";
  const tabs: TabDef[] = [
    { key: "template", label: t.tabs.templatesTemplate, href: "/templates?tab=template" },
    ...(canHistory ? [{ key: "history", label: t.tabs.templatesHistory, href: "/templates?tab=history" }] : []),
  ];
  const requested = (searchParams?.tab ?? "template") as TemplatesTab;
  const active: TemplatesTab = tabs.some((tab) => tab.key === requested) ? requested : "template";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.templates}</h1>
      <TabBar tabs={tabs} active={active} />

      {active === "template" ? (
        <ComingSoon title={t.nav.templates} description={t.stubs.templates} phase={t.stubs.phase4} />
      ) : (
        <SendHistoryPanel />
      )}
    </div>
  );
}
