import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { partnerDbConfigured } from "@/lib/partnership/db";
import { PartnershipClient, type Tab } from "./partnership-client";

export const metadata: Metadata = { title: "Partnership" };
export const dynamic = "force-dynamic";

const TABS: Tab[] = ["pipeline", "kalender", "inbox", "agent", "pengaturan"];

export default async function PartnershipPage({ searchParams }: { searchParams: { tab?: string; lead?: string; c?: string; google?: string } }) {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Partnership</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">Partnership hanya untuk role yang boleh membuat kampanye/workflow.</p>
        </div>
      </div>
    );
  }
  if (!partnerDbConfigured()) {
    return <div className="tint-red rounded-card p-4 font-body text-[13px]">Database partnership belum tersambung (PARTNER_DATABASE_URL).</div>;
  }
  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    email = null;
  }
  const tab = TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : "pipeline";
  return (
    <PartnershipClient
      initialTab={tab}
      initialLead={searchParams.lead ? Number(searchParams.lead) : null}
      initialConversation={searchParams.c ? Number(searchParams.c) : null}
      googleNotice={searchParams.google ?? null}
      canAdmin={isPermitted(role, "workflow.activate")}
      userEmail={email}
    />
  );
}
