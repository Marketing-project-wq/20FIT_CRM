import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { parseCriteria, hasClinicalCriteria } from "@/lib/crm/segment";
import { computeSegment } from "@/lib/crm/segment-read";
import { validateFilterTree, filterTreeToExpr, describeFilterTree, type FilterNode } from "@/lib/crm/filter-tree";
import { thresholdAction, resolveExportColumns, contactColumnsForTree, exportFileName } from "@/lib/crm/export-constants";
import { streamSegmentCsv, type ExportContext } from "@/lib/crm/export";
import { getServerDict } from "@/lib/i18n/server";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Segment CSV export. A downloaded file cannot be recalled, so the gate is strict and the file
 * is self-describing (provenance block + EOF count row). POST (criteria in the body).
 *
 * GATE (PRD 17.2, export split per threshold):
 *   - The segment's row count decides which action is required: ≤ EXPORT_THRESHOLD →
 *     export.at_or_below_threshold, else export.above_threshold.
 *   - super_admin / crm_manager: both allow → stream.
 *   - crm_operator: at_or_below is `allow` (opened 24 Aug 2026 by the product owner — the approval
 *     flow was never built and the requirements doc asks for none) → stream. above is a hard deny.
 *   - unit_manager: at_or_below stays `approval` → 403 "needs approval, feature not available"
 *     (fail-closed: no unit-scope table exists yet). above is a hard deny.
 *   - analyst: DENY. Reason (kept explicit): analyst sees contacts MASKED; a masked export is
 *     useless for contacting, and an unmasked export would defeat the very mask the role exists
 *     to enforce. So there is no coherent analyst export — deny, not "masked export".
 *   - data_steward: DENY (curates data, does not extract lists).
 *
 * CLINICAL criteria (clinic patient / txn / clinic-patient program) infer health status → gated
 * on profile.view_health, identical to the segment builder. NIK / clinical data are NEVER columns
 * in the file regardless (export reads master_customer only) — this gate is about the CRITERIA.
 *
 * SUPPRESSION is excluded and the `export.performed` audit is written after streaming with the
 * real count (see lib/crm/export.ts).
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

  // Must at least be able to build the segment to export it.
  if (!isPermitted(role, "segment.build")) {
    return NextResponse.json(
      { error: "forbidden", message: "Membangun/mengekspor segmen butuh peran segment.build." },
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

  // Clinical criteria → profile.view_health (rejected, not silently dropped).
  if (hasClinicalCriteria(criteria) && !isPermitted(role, "profile.view_health")) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "Kriteria klinis butuh peran profile.view_health (menyaring pasien = menyimpulkan status kesehatan).",
      },
      { status: 403 },
    );
  }

  // Optional AND/OR master filter tree (Sprint 3P) — validated; an inexpressible form is rejected.
  const rawTree = (body as { tree?: unknown } | null)?.tree;
  let masterFilterExpr: string | null = null;
  let treeForAudit: unknown = null;
  if (rawTree != null) {
    const valid = validateFilterTree(rawTree as FilterNode);
    if (!valid.ok) {
      return NextResponse.json({ error: "bad_filter", message: `Filter ditolak: ${valid.error}.` }, { status: 400 });
    }
    masterFilterExpr = filterTreeToExpr(rawTree as FilterNode);
    treeForAudit = rawTree;
  }

  const admin = createAdminClient();

  // Count first — decides which side of the threshold the export is on (which grant to check).
  let matched: number;
  try {
    const counts = await computeSegment(admin, criteria, masterFilterExpr);
    matched = counts.matched;
  } catch (e) {
    logApiFailure("/exports", "count_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const action = thresholdAction(matched);
  const decision = resolveGrant(role, action);
  if (decision !== "allow") {
    const message =
      decision === "needs_approval"
        ? "Ekspor untuk peran ini butuh persetujuan — alur persetujuan belum tersedia, jadi ekspor ditolak."
        : "Peran Anda tidak berhak mengekspor segmen ini.";
    return NextResponse.json({ error: "forbidden", decision, action, matched, message }, { status: 403 });
  }

  // Passed the gate → stream the CSV. The audit row is written by the generator AFTER the last
  // data row with the real count (a mid-stream disconnect leaves no "complete" audit).
  const { lang, t } = getServerDict();
  // Contact columns follow the category: a column guaranteed empty for this filter is dropped
  // (MASALAH 1). Derived from the same tree the filter uses, so display and filter never disagree.
  const columns = resolveExportColumns(contactColumnsForTree(rawTree as FilterNode | null));
  const categoryLabel = rawTree != null ? describeFilterTree(rawTree as FilterNode, true, lang) : t.export.provNoCriteria;
  const ctx: ExportContext = {
    actorId: userId,
    actorEmail: userEmail,
    labels: t.export,
    columns,
    criteriaSummary: summarizeCriteria(
      criteria,
      rawTree != null ? categoryLabel : null,
      t.export.provNoCriteria,
    ),
    criteriaForAudit: {
      unit: criteria.unit, segment: criteria.segment, city: criteria.city, revenue: criteria.revenue,
      has_phone: criteria.hasPhone, has_email: criteria.hasEmail,
      eco_unit: criteria.ecoUnit, eco_product: criteria.ecoProduct,
      src_hyrox: criteria.srcHyrox, src_my20fit: criteria.srcMy20fit, src_recency: criteria.srcRecency,
      src_arena: criteria.srcArena, src_gym: criteria.srcGym,
      src_clinic_patient: criteria.srcClinicPatient, src_clinic_txn: criteria.srcClinicTxn,
      src_rfm: criteria.srcRfm, src_program: criteria.srcProgram,
      filter_tree: treeForAudit,
    },
    nowIso: new Date().toISOString(),
  };

  const encoder = new TextEncoder();
  const gen = streamSegmentCsv(admin, criteria, masterFilterExpr, ctx);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(value));
      } catch (e) {
        logApiFailure("/exports", "stream_failed", { code: (e as { code?: string })?.code });
        controller.error(e);
      }
    },
    async cancel() {
      // Client disconnected → abandon the generator so no "complete" audit row is written.
      await gen.return?.(undefined);
    },
  });

  // Name carries category + date + time so several downloads on one day stay distinct (MASALAH 2).
  const filename = exportFileName(t.export.fileBaseName, categoryLabel, ctx.nowIso);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Short summary of the active criteria for the file's provenance line. The field descriptors are
 *  closed-list technical tokens (kept stable across languages); the "no criteria" fallback follows
 *  the language. */
function summarizeCriteria(c: ReturnType<typeof parseCriteria>, treePhrase: string | null, noneLabel: string): string {
  const parts: string[] = [];
  // The advanced AND/OR filter is what the contact-coverage export buttons send. Write the ACTUAL
  // category ("has email and phone", "email only") so the file self-describes, not a generic label.
  if (treePhrase) parts.push(treePhrase);
  if (c.unit) parts.push(`unit=${c.unit}`);
  if (c.segment) parts.push(`segment=${c.segment}`);
  if (c.city) parts.push(`kota~${c.city}`);
  if (c.revenue !== "all") parts.push(`revenue=${c.revenue}`);
  if (c.hasPhone) parts.push("punya telepon");
  if (c.hasEmail) parts.push("punya email");
  if (c.ecoUnit) parts.push(`eco_unit=${c.ecoUnit}`);
  if (c.ecoProduct) parts.push(`eco_produk=${c.ecoProduct}`);
  if (c.srcHyrox) parts.push("Hyrox");
  if (c.srcMy20fit) parts.push("my20fit");
  if (c.srcRecency) parts.push("aktivitas nyata");
  if (c.srcArena) parts.push("arena");
  if (c.srcGym) parts.push("gym");
  if (c.srcClinicPatient) parts.push("pasien klinik");
  if (c.srcClinicTxn) parts.push("transaksi klinik");
  if (c.srcRfm) parts.push(`RFM=${c.srcRfm}`);
  if (c.srcProgram) parts.push(`program=${c.srcProgram}`);
  return parts.length > 0 ? parts.join(", ") : noneLabel;
}
