import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { flowApi } from "@/lib/crm/flow/api";
import { FlowBuilder } from "./flow-builder";

export const metadata: Metadata = { title: "Flow builder" };
export const dynamic = "force-dynamic";

export default async function FlowPage({ params }: { params: { id: string } }) {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") {
    return <p className="font-body text-[14px] text-ink-soft">Akses ditolak.</p>;
  }
  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    email = null;
  }
  try {
    const detail = await flowApi.get(params.id);
    return <FlowBuilder initial={detail} canActivate={isPermitted(role, "workflow.activate")} userEmail={email} />;
  } catch (e) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/flows" className="font-body text-[13px] text-red">← Semua flow</Link>
        <div className="tint-red rounded-card p-4 font-body text-[13px]">Flow tidak bisa dimuat: {e instanceof Error ? e.message : String(e)}</div>
      </div>
    );
  }
}
