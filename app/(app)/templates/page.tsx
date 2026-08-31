import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TemplateList } from "@/components/templates/template-list";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

/**
 * Templates — ONE screen for writing and managing message templates. The send history moved OUT to
 * the Deliveries tab under Campaigns, where scheduled + running + done + stopped sends live as one
 * timeline: a send is one thing at different stages, not a "history" bolted onto the template editor.
 * Gate mirrors the nav (workflow.create != deny).
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

export default async function TemplatesPage() {
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

  const templates = await loadTemplates();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.templates}</h1>
      <TemplateList templates={templates} lang={lang} />
    </div>
  );
}
