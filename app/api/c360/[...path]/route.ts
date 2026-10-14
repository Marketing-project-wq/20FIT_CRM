import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { c360Fetch, c360Live } from "@/lib/c360";

export const dynamic = "force-dynamic";

/**
 * Session-gated proxy to c360-api — the Customer 360 dashboard shared with admin.20fit.id/data.
 *   /api/c360/ui              → the dashboard page (iframe on /analytics/customer-360)
 *   /api/c360/[ui/]api/...    → its JSON API (meta, overview, customers, customer, pola, profil, refresh, …)
 *
 * Gate: the FULL profile-list grant only ("allow"). The dashboard shows unmasked contact data, so roles
 * that see the list masked or only for their own unit are refused here.
 * CSV export is refused: the CRM has no data-exit path (see app/(app)/exports/page.tsx). It stays
 * available on admin.20fit.id/data, which audits every export.
 */
async function handle(req: NextRequest, { params }: { params: { path?: string[] } }) {
  let signedIn = false;
  try {
    const { data } = await createClient().auth.getUser();
    signedIn = !!data.user;
  } catch {
    signedIn = false;
  }
  if (!signedIn) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await getCurrentUserRole();
  if (grantFor(role, "profile.view_list") !== "allow") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!c360Live()) return NextResponse.json({ error: "c360_not_configured" }, { status: 503 });

  const path = params.path ?? [];
  const segs = path[0] === "ui" ? path.slice(1) : path;
  const upstream = "/" + segs.map(encodeURIComponent).join("/");
  if (upstream !== "/" && !upstream.startsWith("/api/")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (upstream.startsWith("/api/export")) return NextResponse.json({ error: "export_disabled" }, { status: 403 });
  if (upstream === "/api/refresh" && req.method !== "POST") {
    return NextResponse.json({ error: "method" }, { status: 405 });
  }

  let r: Response;
  try {
    r = await c360Fetch(upstream + req.nextUrl.search, { method: req.method, signal: AbortSignal.timeout(120_000) });
  } catch {
    return NextResponse.json({ error: "c360_unreachable" }, { status: 502 });
  }
  const headers = new Headers({ "cache-control": "no-store" });
  for (const h of ["content-type", "content-disposition"]) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(r.body, { status: r.status, headers });
}

export const GET = handle;
export const POST = handle;
