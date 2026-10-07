import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, isPermitted } from "@/lib/auth/roles";
import { fetchEventRegistryView } from "@/lib/crm/event-registry";
import { slugifyTagValue } from "@/lib/crm/tags";

export const dynamic = "force-dynamic";

/**
 * Event registry CRUD — the admin surface behind Event Analysis → "Kelola Event".
 *
 *   GET    — list events (+ participant totals) and every event:* tag with counts/assignment
 *   POST   — create an event { name, slug?, description?, event_date?, tag_slugs[] }
 *   PUT    — update an event { id, name, description?, event_date?, tag_slugs[] } (replaces tags)
 *   DELETE — remove an event { id } (cascades its tag mappings)
 *
 * Reads are allowed to anyone who can view the Event Analysis page; writes require audit.view
 * (super_admin / crm_manager) — the "admin" gate, same as tag management. All DB access is via the
 * service-role admin client (the tables have RLS on with zero policies).
 */

const EVENT_TAG_RE = /^event:[a-z0-9][a-z0-9-]*$/;

function isValidEventDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Normalize + validate a tag_slugs array. Returns null if any entry is not an event:* tag. */
function cleanTagSlugs(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const slug = item.trim().toLowerCase();
    if (!EVENT_TAG_RE.test(slug)) return null;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export async function GET() {
  const role = await getCurrentUserRole();
  if (!canViewProfileList(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  try {
    const view = await fetchEventRegistryView(admin);
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  let body: { name?: string; slug?: string; description?: string; event_date?: string | null; tag_slugs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const slug = slugifyTagValue(body.slug?.trim() || name);
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  if (body.event_date != null && body.event_date !== "" && !isValidEventDate(body.event_date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const tagSlugs = cleanTagSlugs(body.tag_slugs);
  if (tagSlugs === null) return NextResponse.json({ error: "invalid_tags" }, { status: 400 });

  // Actor provenance (best-effort — never blocks the write).
  let createdBy: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    createdBy = data.user?.email ?? data.user?.id ?? null;
  } catch {
    createdBy = null;
  }

  const admin = createAdminClient();

  const { data: event, error: insErr } = await admin
    .from("crm_event_registry")
    .insert({
      name,
      slug,
      description: body.description?.trim() || null,
      event_date: isValidEventDate(body.event_date) ? body.event_date : null,
      created_by: createdBy,
    })
    .select()
    .single();

  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "duplicate_slug" }, { status: 409 });
    }
    return NextResponse.json({ error: (insErr as { message?: string }).message ?? "insert_failed" }, { status: 500 });
  }

  const tagError = await replaceEventTags(admin, event.id, tagSlugs);
  if (tagError) {
    // Roll back the event so a half-created record is never left behind.
    await admin.from("crm_event_registry").delete().eq("id", event.id);
    return NextResponse.json(tagError.body, { status: tagError.status });
  }

  return NextResponse.json({ ok: true, id: event.id }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  let body: { id?: string; name?: string; description?: string; event_date?: string | null; is_active?: boolean; tag_slugs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  if (body.event_date != null && body.event_date !== "" && !isValidEventDate(body.event_date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const tagSlugs = cleanTagSlugs(body.tag_slugs);
  if (tagSlugs === null) return NextResponse.json({ error: "invalid_tags" }, { status: 400 });

  const admin = createAdminClient();

  const updates: Record<string, unknown> = {
    name,
    description: body.description?.trim() || null,
    event_date: isValidEventDate(body.event_date) ? body.event_date : null,
  };
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  const { data: event, error: updErr } = await admin
    .from("crm_event_registry")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const tagError = await replaceEventTags(admin, body.id, tagSlugs);
  if (tagError) return NextResponse.json(tagError.body, { status: tagError.status });

  return NextResponse.json({ ok: true, id: body.id });
}

export async function DELETE(request: NextRequest) {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  // crm_event_registry_tags cascades on the FK, so deleting the event clears its mappings.
  const { error } = await admin.from("crm_event_registry").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Replace an event's tag assignments: delete the current rows, insert the new set. A tag already
 * owned by ANOTHER event trips the global UNIQUE(tag_slug) → surfaced as a 409 naming the tag, so a
 * tag is never silently moved between events. Returns null on success.
 */
async function replaceEventTags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  eventId: string,
  tagSlugs: string[],
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const { error: delErr } = await admin.from("crm_event_registry_tags").delete().eq("event_id", eventId);
  if (delErr) return { status: 500, body: { error: delErr.message } };

  if (tagSlugs.length === 0) return null;

  const rows = tagSlugs.map((tag_slug) => ({ event_id: eventId, tag_slug }));
  const { error: insErr } = await admin.from("crm_event_registry_tags").insert(rows);
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      return { status: 409, body: { error: "tag_assigned_elsewhere" } };
    }
    return { status: 500, body: { error: (insErr as { message?: string }).message ?? "tag_insert_failed" } };
  }
  return null;
}
