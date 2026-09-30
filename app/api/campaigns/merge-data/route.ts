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
    rows: { email: string; rowIndex?: number; fields: Record<string, string> }[];
  };

  if (!body.runId || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "runId and rows[] required" }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin.from("crm_campaign_merge_data").delete().eq("run_id", body.runId);

  const insertRows: { run_id: string; email_normalized: string; field_name: string; field_value: string; row_index: number }[] = [];
  for (const row of body.rows) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    const ri = row.rowIndex ?? 0;
    for (const [fieldName, fieldValue] of Object.entries(row.fields)) {
      insertRows.push({
        run_id: body.runId,
        email_normalized: email,
        field_name: fieldName,
        field_value: fieldValue ?? "",
        row_index: ri,
      });
    }
  }

  if (insertRows.length > 0) {
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
    .select("email_normalized, field_name, field_value, row_index")
    .eq("run_id", runId)
    .order("email_normalized")
    .order("row_index")
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map<string, Record<string, string>>();
  const fields = new Set<string>();
  for (const row of (data ?? []) as { email_normalized: string; field_name: string; field_value: string; row_index: number }[]) {
    const key = `${row.email_normalized}:${row.row_index}`;
    let rec = byKey.get(key);
    if (!rec) { rec = {}; byKey.set(key, rec); }
    rec[row.field_name] = row.field_value;
    fields.add(row.field_name);
  }

  const recipients: { email: string; rowIndex: number; [k: string]: unknown }[] = [];
  byKey.forEach((values, key) => {
    const sepIdx = key.lastIndexOf(":");
    const email = key.slice(0, sepIdx);
    const rowIndex = parseInt(key.slice(sepIdx + 1), 10);
    recipients.push({ email, rowIndex, ...values });
  });

  return NextResponse.json({
    fields: Array.from(fields),
    recipients,
    count: recipients.length,
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
