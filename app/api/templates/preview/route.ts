import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";

/**
 * GET /api/templates/preview?id=<uuid> — render a template's HTML full-page (for "open in new tab").
 * Returns text/html with sample variable values filled in and the unsubscribe link stubbed. Gate:
 * workflow.create. Read-only. The response is the email body as it would render — no chrome.
 */
export async function GET(req: NextRequest) {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") {
    return new NextResponse("Access denied", { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_message_template")
    .select("body")
    .eq("id", id)
    .single();
  if (error || !data) return new NextResponse("Template not found", { status: 404 });

  const html = String((data as { body: string }).body ?? "")
    .replace(/\{\{first_name\}\}/g, "Andi")
    .replace(/\{\{last_name\}\}/g, "Wijaya")
    .replace(/\{\{email\}\}/g, "andi@example.com")
    .replace(/\{\{unsubscribe_url\}\}/g, "#unsubscribe-preview");

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
