import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { SendProgressClient } from "./send-progress-client";

export const metadata: Metadata = { title: "Send progress" };

// Live status, polled — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Live send-progress screen for one run (Part A / K-66). The operator lands here the instant they press
 * Send — the page does NOT wait for the send's HTTP response (a big send is ~15 min, well past any
 * browser/proxy timeout). Everything it shows is polled from the database (crm_campaign_run status +
 * crm_message_log sent-count), so a dropped connection is never read as a failed send. `target` and
 * `label` arrive as query params so "sent / total" and the title show immediately.
 */
export default async function SendProgressPage({
  params,
  searchParams,
}: {
  params: { runId: string };
  searchParams: { target?: string; label?: string };
}) {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();

  if (grantFor(role, "send.at_or_below_threshold") === "deny") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
        <Badge tone="red">{t.access.deniedBadge}</Badge>
      </div>
    );
  }

  const targetNum = searchParams.target ? Number(searchParams.target) : NaN;
  const target = Number.isFinite(targetNum) && targetNum >= 0 ? targetNum : null;

  return <SendProgressClient runId={params.runId} target={target} label={searchParams.label ?? null} />;
}
