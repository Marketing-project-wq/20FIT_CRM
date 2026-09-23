import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KNOWN_TYPO_DOMAINS,
  detectEmailTypo,
  correctEmail,
  type TypoConfidence,
} from "./email-typo";
import { normalizeEmail } from "./normalize";

/**
 * Email typo auto-fix — server-only scan + repair over master_customer.
 *
 * Auto-fixes ONLY high-confidence matches from KNOWN_TYPO_DOMAINS: these are
 * unambiguously wrong (gmail.con cannot receive mail). Medium-confidence
 * (edit-distance-1) matches are returned for display but NOT auto-applied.
 *
 * Each fix: UPDATE master_customer SET email = corrected, email_normalized = corrected
 * WHERE customer_id = $1 AND email_normalized = $2 (optimistic concurrency on the old
 * value — two concurrent runs cannot double-fix the same row). An audit log entry is
 * written per fix for traceability.
 *
 * Collision guard: if the corrected email_normalized already exists in master_customer,
 * the row is SKIPPED (fixing it would create a duplicate identity).
 */

export interface TypoScanRow {
  customerId: string;
  email: string;
  emailNormalized: string;
  domain: string;
  suggestion: string;
  confidence: TypoConfidence;
  correctedEmail: string;
  correctedNormalized: string;
  collision: boolean;
}

export interface TypoScanResult {
  rows: TypoScanRow[];
  totalScanned: number;
  fixable: number;
  collisions: number;
  mediumOnly: number;
}

export interface TypoFixSummary {
  attempted: number;
  fixed: number;
  skipped: number;
  collisions: number;
  errors: number;
}

const SCAN_BATCH = 500;

/**
 * Scan master_customer for emails with known typo domains. Returns rows grouped by
 * fixability: high-confidence + no collision = fixable; high + collision = blocked;
 * medium = review-only.
 */
export async function scanEmailTypos(admin: SupabaseClient): Promise<TypoScanResult> {
  const typoDomains = Object.keys(KNOWN_TYPO_DOMAINS);
  if (typoDomains.length === 0) {
    return { rows: [], totalScanned: 0, fixable: 0, collisions: 0, mediumOnly: 0 };
  }

  const orFilter = typoDomains
    .map((d) => `email_normalized.like.%@${d}`)
    .join(",");

  const allRows: TypoScanRow[] = [];
  let offset = 0;
  let totalScanned = 0;

  // Fetch known-typo-domain rows in batches
  while (true) {
    const { data, error } = await admin
      .from("master_customer")
      .select("customer_id, email, email_normalized")
      .or(orFilter)
      .is("is_merged", false)
      .range(offset, offset + SCAN_BATCH - 1)
      .order("customer_id");

    if (error) throw error;
    const rows = (data ?? []) as {
      customer_id: string;
      email: string;
      email_normalized: string;
    }[];
    if (rows.length === 0) break;

    totalScanned += rows.length;

    for (const row of rows) {
      const result = detectEmailTypo(row.email_normalized);
      if (!result.suspect || !result.suggestion || !result.domain) continue;

      const correctedEmail = correctEmail(row.email, result.suggestion);
      const correctedNormalized = normalizeEmail(correctedEmail);
      if (!correctedNormalized) continue;
      if (correctedNormalized === row.email_normalized) continue;

      allRows.push({
        customerId: row.customer_id,
        email: row.email,
        emailNormalized: row.email_normalized,
        domain: result.domain,
        suggestion: result.suggestion,
        confidence: result.confidence!,
        correctedEmail,
        correctedNormalized,
        collision: false,
      });
    }

    if (rows.length < SCAN_BATCH) break;
    offset += SCAN_BATCH;
  }

  // Check collisions: corrected emails that already exist in master_customer
  const uniqueCorrected = Array.from(new Set(allRows.map((r) => r.correctedNormalized)));
  const existingSet = new Set<string>();

  for (let i = 0; i < uniqueCorrected.length; i += 100) {
    const batch = uniqueCorrected.slice(i, i + 100);
    const { data, error } = await admin
      .from("master_customer")
      .select("email_normalized")
      .in("email_normalized", batch);
    if (error) throw error;
    for (const r of (data ?? []) as { email_normalized: string }[]) {
      existingSet.add(r.email_normalized);
    }
  }

  for (const row of allRows) {
    if (existingSet.has(row.correctedNormalized)) {
      row.collision = true;
    }
  }

  const fixable = allRows.filter(
    (r) => r.confidence === "high" && !r.collision,
  ).length;
  const collisions = allRows.filter((r) => r.collision).length;
  const mediumOnly = allRows.filter((r) => r.confidence === "medium").length;

  return { rows: allRows, totalScanned, fixable, collisions, mediumOnly };
}

/**
 * Apply auto-fixes to all high-confidence, collision-free typo rows. Each fix is an
 * atomic UPDATE + audit-log INSERT. Returns a summary.
 */
export async function applyEmailTypoFixes(
  admin: SupabaseClient,
  rows: TypoScanRow[],
  actorEmail: string,
): Promise<TypoFixSummary> {
  const fixable = rows.filter(
    (r) => r.confidence === "high" && !r.collision,
  );

  const summary: TypoFixSummary = {
    attempted: fixable.length,
    fixed: 0,
    skipped: 0,
    collisions: 0,
    errors: 0,
  };

  for (const row of fixable) {
    // Optimistic concurrency: only update if the email still matches
    const { data, error } = await admin
      .from("master_customer")
      .update({
        email: row.correctedEmail,
        email_normalized: row.correctedNormalized,
      })
      .eq("customer_id", row.customerId)
      .eq("email_normalized", row.emailNormalized)
      .is("is_merged", false)
      .select("customer_id")
      .maybeSingle();

    if (error) {
      // 23505 = unique constraint violation (collision with existing email)
      if ((error as { code?: string }).code === "23505") {
        summary.collisions++;
      } else {
        summary.errors++;
      }
      continue;
    }

    if (!data) {
      summary.skipped++;
      continue;
    }

    summary.fixed++;

    // Audit log — PII-free: only domains, not full addresses
    await admin.from("crm_audit_log").insert({
      action: "email_typo.auto_fix",
      actor_email: actorEmail,
      target_table: "master_customer",
      target_id: row.customerId,
      summary: `Domain auto-corrected: @${row.domain} → @${row.suggestion}`,
      metadata: {
        old_domain: row.domain,
        new_domain: row.suggestion,
        confidence: row.confidence,
      },
    });
  }

  return summary;
}
