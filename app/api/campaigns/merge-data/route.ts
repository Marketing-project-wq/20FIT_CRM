import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/crm/normalize";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    runId: string;
    rows: { email: string; fields: Record<string, string> }[];
  };

  if (!body.runId || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "runId and rows[] required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Delete existing merge data for this run before inserting new data
  await admin.from("crm_campaign_merge_data").delete().eq("run_id", body.runId);

  const insertRows: { run_id: string; email_normalized: string; field_name: string; field_value: string }[] = [];
  for (const row of body.rows) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    for (const [fieldName, fieldValue] of Object.entries(row.fields)) {
      insertRows.push({
        run_id: body.runId,
        email_normalized: email,
        field_name: fieldName,
        field_value: fieldValue ?? "",
      });
    }
  }

  if (insertRows.length > 0) {
    // Insert in chunks of 500 to avoid request size limits
    for (let i = 0; i < insertRows.length; i += 500) {
      const chunk = insertRows.slice(i, i + 500);
      const { error } = await admin.from("crm_campaign_merge_data").insert(chunk);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    inserted: insertRows.length,
    recipients: body.rows.length,
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_campaign_merge_data")
    .select("email_normalized, field_name, field_value")
    .eq("run_id", runId)
    .order("email_normalized")
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by email
  const byEmail = new Map<string, Record<string, string>>();
  const fields = new Set<string>();
  for (const row of (data ?? []) as { email_normalized: string; field_name: string; field_value: string }[]) {
    let rec = byEmail.get(row.email_normalized);
    if (!rec) { rec = {}; byEmail.set(row.email_normalized, rec); }
    rec[row.field_name] = row.field_value;
    fields.add(row.field_name);
  }

  return NextResponse.json({
    fields: Array.from(fields),
    recipients: Array.from(byEmail.entries()).map(([email, values]) => ({ email, ...values })),
    count: byEmail.size,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("crm_campaign_merge_data").delete().eq("run_id", runId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
