import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAudience, fetchProfileById } from "./audience";
import { fetchDashboardStats } from "./dashboard";
import { fetchQualitySnapshot } from "./quality";
import { fetchConsentScreen } from "./consent";
import { fetchAuditLog } from "./audit-log";
import { prepareSearch } from "./search";
import { runProfileSearch } from "./search-read";

/**
 * Read-layer self-check for the diagnostic page. Calls the ACTUAL `supabase-js` read
 * layers — the same functions the routes use — and reports PASS/FAIL + duration per layer.
 * This is what proves the queries really run against Supabase, exactly what
 * scripts/verify-live.mjs does, but from a page instead of a terminal.
 *
 * CRITICAL: it calls READ LAYERS, never route handlers. Route handlers write the audit
 * rows; the read layers only SELECT. So running these checks writes ZERO audit rows for
 * the routes being checked — it must not flood the audit log with its own probes, which
 * would corrupt the very evidence it reports. Proven by lib/crm/diagnostic.test.ts, which
 * runs every check against a spy client and asserts no crm_audit_log INSERT.
 *
 * A well-formed-but-absent UUID is used for the profile check: it exercises the real
 * query and returns null (no throw), without reading a real customer or writing anything.
 */

const ABSENT_UUID = "00000000-0000-0000-0000-000000000000";

export interface CheckResult {
  name: string;
  layer: string;
  ok: boolean;
  ms: number;
  code: string | null; // DB/error code on failure — PII-free
}

export interface DiagnosticCheck {
  name: string;
  layer: string;
  run: (admin: SupabaseClient) => Promise<unknown>;
}

/** The read layers to exercise. Each `run` calls a read layer and discards the result —
 *  we only care that the query executes without error. */
export const DIAGNOSTIC_CHECKS: readonly DiagnosticCheck[] = [
  {
    name: "Audience — daftar",
    layer: "fetchAudience",
    run: (a) => fetchAudience(a, { page: 1, pageSize: 1, unit: null, segment: null, city: null, revenue: "all" }, true),
  },
  {
    name: "Detail profil",
    layer: "fetchProfileById",
    run: (a) => fetchProfileById(a, ABSENT_UUID, true),
  },
  { name: "Dashboard", layer: "fetchDashboardStats", run: (a) => fetchDashboardStats(a) },
  { name: "Quality", layer: "fetchQualitySnapshot", run: (a) => fetchQualitySnapshot(a) },
  {
    name: "Consent register",
    layer: "fetchConsentScreen",
    run: (a) => fetchConsentScreen(a, { consentPage: 1, suppressionPage: 1, pageSize: 1 }, true),
  },
  { name: "Audit log", layer: "fetchAuditLog", run: (a) => fetchAuditLog(a, { page: 1, pageSize: 1 }) },
  {
    name: "Pencarian",
    layer: "runProfileSearch",
    run: (a) => {
      const p = prepareSearch("phone", "628123456789");
      if (!p.ok) throw new Error("prepareSearch failed to build a probe");
      return runProfileSearch(a, p, true);
    },
  },
];

/** Run every check in sequence, timing each. Never throws — a failing layer is reported,
 *  not propagated, so one broken layer doesn't hide the health of the others. */
export async function runReadLayerChecks(
  admin: SupabaseClient,
  checks: readonly DiagnosticCheck[] = DIAGNOSTIC_CHECKS,
): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of checks) {
    const start = Date.now();
    try {
      await c.run(admin);
      out.push({ name: c.name, layer: c.layer, ok: true, ms: Date.now() - start, code: null });
    } catch (e) {
      out.push({
        name: c.name,
        layer: c.layer,
        ok: false,
        ms: Date.now() - start,
        code: (e as { code?: string })?.code ?? (e as Error)?.name ?? "error",
      });
    }
  }
  return out;
}
