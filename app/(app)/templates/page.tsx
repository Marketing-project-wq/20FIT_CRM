import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { SendHistoryPanel } from "@/components/messages/send-history-panel";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { getServerDict } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TemplateList } from "@/components/templates/template-list";

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
async function loadTemplates() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_message_template")
      .select("id, template_key, channel, language, name, subject, version, wa_approval_status, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load templates:", error);
      return [];
    }

    // Deduplicate by template_key — only return the latest version
    const seen = new Set<string>();
    const unique = [];
    for (const tpl of data ?? []) {
      if (!seen.has(tpl.template_key)) {
        seen.add(tpl.template_key);
        unique.push(tpl);
      }
    }
    return unique;
  } catch (err) {
    console.error("Failed to load templates:", err);
    return [];
  }
}

export default async function TemplatesPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const role = await getCurrentUserRole();
  const { t, lang } = getServerDict();

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

  const templates = active === "template" ? await loadTemplates() : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.templates}</h1>
      <TabBar tabs={tabs} active={active} />

      {active === "template" ? (
        <TemplateList templates={templates} lang={lang} />
      ) : (
        <SendHistoryPanel />
      )}
    </div>
  );
}
