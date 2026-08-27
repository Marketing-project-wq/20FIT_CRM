import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { realSendEnabled } from "@/lib/crm/send-gate";
import { listWorkflows } from "@/lib/crm/workflow-store";
import { extractVariables } from "@/lib/crm/template";
import { isInternalTestTemplateKey } from "@/lib/crm/send-test-constants";
import { WorkflowsClient, type TemplateOpt } from "./workflows-client";

export const metadata: Metadata = { title: "Workflows" };
export const dynamic = "force-dynamic";

/** Email templates carrying {{unsubscribe_url}} — same eligibility as campaigns. */
async function loadEligibleTemplates(): Promise<TemplateOpt[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_message_template")
      .select("template_key, name, subject, body, version")
      .eq("channel", "email").eq("is_active", true)
      .order("version", { ascending: false });
    if (error) return [];
    const seen = new Set<string>();
    const out: TemplateOpt[] = [];
    for (const r of (data ?? []) as { template_key: string; name: string; subject: string | null; body: string }[]) {
      if (isInternalTestTemplateKey(r.template_key) || seen.has(r.template_key)) continue;
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

export default async function WorkflowsPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (grantFor(role, "send.at_or_below_threshold") === "deny") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.workflows}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{t.workflowsPage.deniedRole}</p>
        </div>
      </div>
    );
  }

  const [workflows, templates] = await Promise.all([listWorkflows(), loadEligibleTemplates()]);
  return <WorkflowsClient initial={workflows} templates={templates} realSend={realSendEnabled()} />;
}
