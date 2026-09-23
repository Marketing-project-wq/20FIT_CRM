import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canImportAudience } from "@/lib/auth/roles";
import { scanEmailTypos, applyEmailTypoFixes } from "@/lib/crm/email-typo-fix";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";

/**
 * Email typo scan + auto-fix API.
 *
 * GET  — scan master_customer for typo'd emails, return fixable rows
 * POST — apply all high-confidence, collision-free fixes
 *
 * Gate: canImportAudience (super_admin only). This is a bulk master_customer write
 * operation — same authority as import.
 */

export async function GET() {
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    userEmail = null;
  }
  if (!userEmail) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const role = await getCurrentUserRole();
  if (!canImportAudience(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const result = await scanEmailTypos(admin);
    return NextResponse.json(result);
  } catch {
    logApiFailure("typo-fix/scan", "scan_failed");
    return NextResponse.json({ error: "scan_failed" }, { status: 500 });
  }
}

export async function POST() {
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    userEmail = null;
  }
  if (!userEmail) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const role = await getCurrentUserRole();
  if (!canImportAudience(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();

    // Re-scan to get the current state (never trust stale client data)
    const scan = await scanEmailTypos(admin);
    if (scan.fixable === 0) {
      return NextResponse.json({
        summary: { attempted: 0, fixed: 0, skipped: 0, collisions: 0, errors: 0 },
        message: "no_fixable_rows",
      });
    }

    const summary = await applyEmailTypoFixes(admin, scan.rows, userEmail);

    // Write a summary audit entry for the bulk operation
    await admin.from("crm_audit_log").insert({
      action: "email_typo.bulk_fix",
      actor_email: userEmail,
      target_table: "master_customer",
      summary: `Bulk email typo fix: ${summary.fixed} corrected, ${summary.skipped} skipped, ${summary.collisions} collisions, ${summary.errors} errors`,
      metadata: {
        attempted: summary.attempted,
        fixed: summary.fixed,
        skipped: summary.skipped,
        collisions: summary.collisions,
        errors: summary.errors,
      },
    });

    return NextResponse.json({ summary });
  } catch {
    logApiFailure("typo-fix/apply", "fix_failed");
    return NextResponse.json({ error: "fix_failed" }, { status: 500 });
  }
}
