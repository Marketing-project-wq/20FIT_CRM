import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { proposeSegment, AiUnavailableError } from "@/lib/crm/segment-ai";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * AI segment assistant. Free text → (server) LLM → JSON → sanitizeAssistOutput → PROPOSAL.
 * It returns proposed criteria ONLY — it does NOT compute or read customer rows. The user reviews,
 * edits, and runs the proposal through the ordinary segment path (which is audited + gated there).
 *
 * SECURITY: the LLM never writes SQL and never touches the database; its JSON is fully re-validated
 * by sanitizeAssistOutput (closed-list vocabulary + the SAME profile.view_health gate as the manual
 * builder). The API key stays server-side. If the model is unavailable, this 503s and the manual
 * builder keeps working — AI accelerates, it does not replace.
 *
 * AUDIT: this is a read shaped by user parameters, so it is audited (list.viewed,
 * view='segment_ai_assist'). We record the RESOLVED criteria, NOT the raw text: free text can hold
 * a person's name ("cari data Budi") and the audit is append-only, so storing it would bake PII in
 * permanently. The resolved closed-list criteria are the accountable artifact (city, already capped
 * at 60 upstream, is the only free-text field that survives). An unlogged proposal is refused (503).
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
      { error: "forbidden", decision: resolveGrant(role, "segment.build"), message: "Butuh peran segment.build." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body JSON tidak valid." }, { status: 400 });
  }
  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : "";
  if (text.trim() === "") {
    return NextResponse.json({ error: "bad_request", message: "Tulis deskripsi segmennya dulu." }, { status: 400 });
  }

  const canViewHealth = isPermitted(role, "profile.view_health");

  let proposal;
  try {
    proposal = await proposeSegment(text, { canViewHealth });
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      logApiFailure("/segments/assist", "ai_unavailable", { code: e.message.slice(0, 40) });
      return NextResponse.json(
        { error: "ai_unavailable", message: "Asisten AI sedang tidak tersedia. Pakai filter manual — semua kriteria tetap ada." },
        { status: 503 },
      );
    }
    logApiFailure("/segments/assist", "assist_failed", {});
    return NextResponse.json({ error: "assist_failed" }, { status: 500 });
  }

  // Mandatory audit — parameterized read. Records the RESOLVED criteria, never the raw text.
  const adminClient = createAdminClient();
  const { error: auditError } = await adminClient.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "list.viewed",
    target_table: "master_customer",
    summary: `Usulan segmen AI (${proposal.conditions.length} kondisi, ${proposal.clinicalBlocked ? "klinis digerbangi" : "tanpa klinis digerbangi"}).`,
    metadata: {
      view: "segment_ai_assist",
      // NON-PII: closed-list resolved criteria (city capped at 60 upstream). NOT the raw prompt.
      conditions: proposal.conditions,
      criteria: {
        eco_unit: proposal.criteria.ecoUnit,
        eco_product: proposal.criteria.ecoProduct,
        src_hyrox: proposal.criteria.srcHyrox,
        src_my20fit: proposal.criteria.srcMy20fit,
        src_recency: proposal.criteria.srcRecency,
        src_arena: proposal.criteria.srcArena,
        src_gym: proposal.criteria.srcGym,
        src_clinic_patient: proposal.criteria.srcClinicPatient,
        src_clinic_txn: proposal.criteria.srcClinicTxn,
        src_rfm: proposal.criteria.srcRfm,
        src_program: proposal.criteria.srcProgram,
      },
      clinical_blocked: proposal.clinicalBlocked,
      unexpressible_count: proposal.unexpressible.length,
    },
  });
  if (auditError) {
    logApiFailure("/segments/assist", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: "Usulan ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  return NextResponse.json(proposal, { headers: { "Cache-Control": "no-store" } });
}
