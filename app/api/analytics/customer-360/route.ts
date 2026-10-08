import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { fetchCustomer360Analytics } from "@/lib/crm/customer-360";

export const dynamic = "force-dynamic";

/** Client-side refresh endpoint for the Customer 360° page. Same access gate as the page. */
export async function GET() {
  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  try {
    const data = await fetchCustomer360Analytics(admin);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
