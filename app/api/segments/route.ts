import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, canSeeMedical, resolveGrant } from "@/lib/auth/roles";
import { parseCriteria, hasClinicalCriteria } from "@/lib/crm/segment";
import { computeSegment } from "@/lib/crm/segment-read";
import { activeMirrorFlagColumns, fetchMirrorMeta } from "@/lib/crm/mirror";
import { validateFilterTree, filterTreeToExpr, type FilterNode } from "@/lib/crm/filter-tree";
import { logApiFailure } from "@/lib/crm/failure-log";
import { getServerDict } from "@/lib/i18n/server";

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

  const { lang, t } = getServerDict();
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "segment.build")) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "segment.build"),
        message: t.segments.apiRoleDenied,
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: t.segments.apiBadJson }, { status: 400 });
  }

  const criteria = parseCriteria(body);

  // CLINICAL criteria (clinic patient / transaction) INFER health status from a count — they
  // are gated on profile.view_health (via the SAME canSeeMedical helper the profile read layers
  // use, K-31: one rule, one place) and REJECTED (not silently dropped) for a role without it.
  if (hasClinicalCriteria(criteria) && !canSeeMedical(role)) {
    return NextResponse.json(
      {
        error: "forbidden",
        decision: resolveGrant(role, "profile.view_health"),
        message: t.segments.apiClinicalNeedsHealth,
      },
      { status: 403 },
    );
  }

  // AND/OR filter tree (Sprint 3P). When present it REPLACES the flat master fields. It is
  // validated here; an inexpressible form (too deep, too many, unsafe value, empty group) is
  // REJECTED with 400 — never silently simplified into something that means something else.
  const rawTree = (body as { tree?: unknown } | null)?.tree;
  let masterFilterExpr: string | null = null;
  let treeForAudit: unknown = null;
  if (rawTree != null) {
    const tree = rawTree as FilterNode;
    const valid = validateFilterTree(tree, 1, lang);
    if (!valid.ok) {
      return NextResponse.json(
        { error: "bad_filter", message: `${t.segments.apiBadFilterA}${valid.error}${t.segments.apiBadFilterB}` },
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
    summary: `Segment builder dihitung (cocok ${counts.matched}, marketing ${counts.contactableMarketing}, layanan ${counts.contactableService}).`,
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
        src_hyrox: criteria.srcHyrox,
        src_my20fit: criteria.srcMy20fit,
        src_recency: criteria.srcRecency,
        src_arena: criteria.srcArena,
        src_gym: criteria.srcGym,
        src_clinic_patient: criteria.srcClinicPatient,
        src_clinic_txn: criteria.srcClinicTxn,
        src_rfm: criteria.srcRfm,
        src_program: criteria.srcProgram,
      },
      // AND/OR tree structure (closed-list fields/values; city leaf capped at 60 in
      // validateFilterTree, K-17). Null when the flat criteria path was used.
      filter_tree: treeForAudit,
      matched: counts.matched,
      contactable_marketing: counts.contactableMarketing,
      contactable_service: counts.contactableService,
    },
  });
  if (auditError) {
    logApiFailure("/segments", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: t.segments.apiAuditFailed },
      { status: 503 },
    );
  }

  // Mirror provenance (Sprint 5A): when a source-presence flag shaped this count, that part was
  // read from crm_customer_mirror. Surface the mirror's freshness so a snapshot never looks live.
  // Best-effort: a meta read failure must not fail the compute (the count already succeeded).
  let mirrorRefreshedAt: string | null = null;
  if (activeMirrorFlagColumns(criteria).length > 0) {
    try {
      mirrorRefreshedAt = (await fetchMirrorMeta(admin)).refreshedAt;
    } catch {
      mirrorRefreshedAt = null;
    }
  }

  return NextResponse.json(
    {
      matched: counts.matched,
      contactableMarketing: counts.contactableMarketing,
      contactableService: counts.contactableService,
      mirrorRefreshedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
