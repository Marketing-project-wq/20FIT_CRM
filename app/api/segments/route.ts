import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { parseCriteria } from "@/lib/crm/segment";
import { computeSegment } from "@/lib/crm/segment-read";
import { validateFilterTree, filterTreeToExpr, type FilterNode } from "@/lib/crm/filter-tree";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Segment builder compute API. Computes ONE definition's counts and returns them — no
 * rows, no save, no export. POST (criteria in the body, and it's a parameterized read).
 *
 * Gate: segment.build (super_admin, crm_manager, crm_operator, analyst; unit_manager is
 * own_unit -> needs_scope -> DENY until the scope table exists; data_steward denied).
 * Fail-closed.
 *
 * AUDIT: computing a segment is a list read with user parameters (K-07) -> mandatory
 * `list.viewed` with target_table='master_customer' and metadata.view='segment_builder'.
 * NOT a new `segment.*` action: that would fall between migration 8's allowlist and
 * denylist and pile up forever (docs/RENCANA-simpan-segmen.md). Unlogged compute is
 * refused (503). Criteria go in metadata (closed-list values; the free-text city is
 * length-capped in parseCriteria, K-17).
 *
 * No rows are returned, so there is nothing to mask — a segment builder that emits people
 * is an export without a name. Counts only.
 */
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "segment.build"),
        message:
          "Membangun segmen butuh peran segment.build (super_admin, crm_manager, crm_operator, analyst).",
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body JSON tidak valid." }, { status: 400 });
  }

  const criteria = parseCriteria(body);

  // AND/OR filter tree (Sprint 3P). When present it REPLACES the flat master fields. It is
  // validated here; an inexpressible form (too deep, too many, unsafe value, empty group) is
  // REJECTED with 400 — never silently simplified into something that means something else.
  const rawTree = (body as { tree?: unknown } | null)?.tree;
  let masterFilterExpr: string | null = null;
  let treeForAudit: unknown = null;
  if (rawTree != null) {
    const tree = rawTree as FilterNode;
    const valid = validateFilterTree(tree);
    if (!valid.ok) {
      return NextResponse.json(
        { error: "bad_filter", message: `Filter ditolak: ${valid.error}.` },
        { status: 400 },
      );
    }
    masterFilterExpr = filterTreeToExpr(tree);
    treeForAudit = tree;
  }

  const admin = createAdminClient();

  let counts;
  try {
    counts = await computeSegment(admin, criteria, masterFilterExpr);
  } catch (e) {
    logApiFailure("/segments", "compute_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Mandatory audit — parameterized list read.
  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "list.viewed",
    target_table: "master_customer",
    summary: `Segment builder dihitung (cocok ${counts.matched}, boleh dihubungi ${counts.contactable}).`,
    // NON-PII: closed-list criteria + counts. city is user-typed, length-capped upstream.
    metadata: {
      view: "segment_builder",
      criteria: {
        unit: criteria.unit,
        segment: criteria.segment,
        city: criteria.city,
        revenue: criteria.revenue,
        has_phone: criteria.hasPhone,
        has_email: criteria.hasEmail,
        eco_unit: criteria.ecoUnit,
        eco_product: criteria.ecoProduct,
      },
      // AND/OR tree structure (closed-list fields/values; city leaf capped at 60 in
      // validateFilterTree, K-17). Null when the flat criteria path was used.
      filter_tree: treeForAudit,
      matched: counts.matched,
      contactable: counts.contactable,
    },
  });
  if (auditError) {
    logApiFailure("/segments", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: "Perhitungan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { matched: counts.matched, contactable: counts.contactable },
    { headers: { "Cache-Control": "no-store" } },
  );
}
