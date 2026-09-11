import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted } from "@/lib/auth/roles";
import { TAG_NAMESPACES, isOperatorTag, normalizeTag } from "@/lib/crm/tags";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_tag_registry")
    .select("id, slug, namespace, label, show_in_event_spread, created_at, updated_at")
    .order("namespace")
    .order("slug");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tags: data });
}

export async function POST(request: NextRequest) {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  let body: { slug?: string; label?: string; show_in_event_spread?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const slug = normalizeTag(body.slug ?? "");
  if (!isOperatorTag(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  const namespace = slug.slice(0, slug.indexOf(":"));
  if (!(TAG_NAMESPACES as readonly string[]).includes(namespace)) {
    return NextResponse.json({ error: "invalid_namespace" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_tag_registry")
    .insert({
      slug,
      namespace,
      label: body.label?.trim() || null,
      show_in_event_spread: body.show_in_event_spread ?? false,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  let body: { id?: number; label?: string | null; show_in_event_spread?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) updates.label = body.label?.trim() || null;
  if (typeof body.show_in_event_spread === "boolean") updates.show_in_event_spread = body.show_in_event_spread;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_tag_registry")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ tag: data });
}

export async function DELETE(request: NextRequest) {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("crm_tag_registry")
    .delete()
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
