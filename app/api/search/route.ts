import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList, shouldMaskContact, resolveGrant } from "@/lib/auth/roles";
import { isSearchKind, prepareSearch } from "@/lib/crm/search";
import { runProfileSearch } from "@/lib/crm/search-read";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Profile SEARCH — find ONE person (name substring, or phone/email exact) to reach the
 * suppression write path. Distinct from /api/audience, which BROWSES a filtered list.
 *
 * POST, not GET, ON PURPOSE: the query is a person's phone/email/name — PII. A GET would
 * put it in the URL and every access log. POST keeps it in the body, and the audit row
 * (below) deliberately does NOT store it either.
 *
 * Gate: profile.view_list (same as /audience), fail-closed. Masking server-side for roles
 * without profile.view_contact — the existing pattern, not re-implemented.
 *
 * AUDIT — action `search.performed` (prefix `search.%` is on migration 8's operational
 * allowlist → purged after 90 days). What it records answers "who searched, and found
 * whom": `kind`, `result_count`, and `target_id` WHEN there is exactly one hit (the
 * strongest record). It NEVER stores the query string. That is a DELIBERATE difference
 * from the Sprint 3D city-filter value: a city is an attribute, but a search query IS a
 * person's identity (their phone/email/name). Writing it would drop PII into the
 * append-only audit log that no one can purge — worse than the value it would add, which
 * the result already carries. Do not "enrich" this by logging the query; the next reader
 * will be tempted, and this comment is why not.
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
  if (!canViewProfileList(role)) {
    return NextResponse.json(
      { error: "forbidden", decision: resolveGrant(role, "profile.view_list") },
      { status: 403 },
    );
  }

  let body: { kind?: unknown; q?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body JSON tidak valid." }, { status: 400 });
  }

  if (!isSearchKind(body.kind)) {
    return NextResponse.json(
      { error: "invalid_kind", message: "Pilih jenis pencarian: name, phone, atau email." },
      { status: 422 },
    );
  }

  // Input validation. A rejected query searched NOTHING and disclosed NOTHING, so it is
  // not audited (audit covers executed searches only).
  const prepared = prepareSearch(body.kind, typeof body.q === "string" ? body.q : null);
  if (!prepared.ok) {
    return NextResponse.json({ error: "invalid_query", message: prepared.error }, { status: 422 });
  }

  const masked = shouldMaskContact(role);
  const admin = createAdminClient();

  let outcome;
  try {
    outcome = await runProfileSearch(admin, prepared, masked);
  } catch (e) {
    logApiFailure("/search", "search_query_failed", { code: (e as { code?: string })?.code });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Mandatory audit (individual rows + user parameter). target_id only when exactly one
  // hit — that is the record worth keeping: who searched, and found whom. NO query stored.
  const resultCount =
    outcome.status === "ok" ? outcome.count : outcome.status === "too_many" ? outcome.cap + 1 : 0;
  const targetId =
    outcome.status === "ok" && outcome.rows.length === 1 ? outcome.rows[0].customer_id : null;

  const { error: auditError } = await admin.from("crm_audit_log").insert({
    actor_id: userId,
    actor_email: userEmail,
    action: "search.performed",
    target_table: "master_customer",
    target_id: targetId,
    summary: `Pencarian profil (${prepared.kind}) — ${
      outcome.status === "too_many" ? `> ${outcome.cap} hasil` : `${resultCount} hasil`
    }.`,
    // NON-PII: kind + counts only. The query string is NEVER stored (it is a person's
    // identity). `too_many` marks that result_count is a floor (cap+1), not the exact total.
    metadata: {
      kind: prepared.kind,
      result_count: resultCount,
      too_many: outcome.status === "too_many",
    },
  });
  if (auditError) {
    logApiFailure("/search", "audit_write_failed", { code: auditError.code });
    return NextResponse.json(
      { error: "audit_failed", message: "Pencarian ditolak: gagal mencatat audit (akuntabilitas)." },
      { status: 503 },
    );
  }

  if (outcome.status === "empty") {
    return NextResponse.json({ status: "empty", kind: prepared.kind }, { headers: { "Cache-Control": "no-store" } });
  }
  if (outcome.status === "too_many") {
    return NextResponse.json(
      { status: "too_many", kind: prepared.kind, cap: outcome.cap },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { status: "ok", kind: prepared.kind, rows: outcome.rows, count: outcome.count, masked },
    { headers: { "Cache-Control": "no-store" } },
  );
}
