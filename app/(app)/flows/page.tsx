import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { flowApi } from "@/lib/crm/flow/api";
import type { FlowSummary } from "@/lib/crm/flow/types";
import { FlowsList } from "./flows-list";

export const metadata: Metadata = { title: "Flow" };
export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Flow</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">Flow hanya untuk role yang boleh membuat workflow.</p>
        </div>
      </div>
    );
  }
  let flows: FlowSummary[] = [];
  let error: string | null = null;
  try {
    flows = (await flowApi.list()).flows;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return <FlowsList flows={flows} error={error} canActivate={isPermitted(role, "workflow.activate")} />;
}
