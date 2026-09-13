import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { fetchEventAnalytics, type EventAnalyticsFilter } from "@/lib/crm/event-analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = req.nextUrl;
  const eventsParam = url.searchParams.get("events");
  const dateFrom = url.searchParams.get("from");
  const dateTo = url.searchParams.get("to");

  const filter: EventAnalyticsFilter = {};
  if (eventsParam) {
    filter.eventSlugs = eventsParam.split(",").filter(Boolean);
  }
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    filter.dateFrom = dateFrom;
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    filter.dateTo = dateTo;
  }

  const hasFilter = filter.eventSlugs || filter.dateFrom || filter.dateTo;
  const admin = createAdminClient();
  const data = await fetchEventAnalytics(admin, hasFilter ? filter : undefined);

  return NextResponse.json(data);
}
