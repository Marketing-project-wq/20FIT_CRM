#!/usr/bin/env node
/**
 * verify-live.mjs — LIVE data-layer verification against the real Supabase project.
 *
 * ⚠️ FALLBACK PATH (Sprint 3L). The easiest way to validate a deploy is now to log in and
 * open `/settings/diagnostik` — it runs these same read-layer checks from a page and
 * computes each route's status from crm_audit_log, no terminal needed. Keep this script
 * for the case the APP ITSELF won't open (bad build, env, or Supabase down) — then an
 * out-of-app check is the only way. While the app is up, prefer /settings/diagnostik.
 *
 * WHY THIS EXISTS: for three sprints the audience/quality/dashboard/audit/profile read
 * layers could not be executed here — this sandbox's proxy 403s the Supabase host. The
 * one unverified thing is the PostgREST query CONSTRUCTION, so this script runs the
 * ACTUAL read-layer functions (fetchAudience, fetchQualitySnapshot, fetchDashboardStats,
 * fetchAuditLog, fetchProfileById) against the live DB and diffs the results.
 *
 * ── HOW TO RUN (needs production credentials — 10 minutes) ────────────────────────
 *   1. Put the Railway values in .env.local at the repo root:
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...            (service role — bypasses RLS, server only)
 *   2. Run with Node >= 22.6 (for TypeScript stripping):
 *        node --experimental-strip-types scripts/verify-live.mjs
 *
 * This is NOT part of `npm test` and NOT run in CI — it needs production credentials
 * that must never live in CI. It is a hand-run gate before merging.
 *
 * ── SAFETY GUARANTEES ─────────────────────────────────────────────────────────────
 *   • READ-ONLY. It calls the read LAYERS (which only SELECT), never the route
 *     handlers (which write audit rows). It counts crm_audit_log before and after and
 *     FAILS if the number changed — proof that verification wrote nothing.
 *   • NEVER prints PII. Only counts, and ONE profile sample fetched with masking ON,
 *     so the terminal sees `62812****8953`, never a real number. A verifier that
 *     leaks a phone to the terminal is a new breach, not a verification.
 *
 * The `server-only` marker package is stubbed by the loader hook below (it is not
 * installed outside Next), and extensionless `.ts` relative imports are resolved —
 * so the exact production read-layer code runs unmodified under plain Node.
 * ──────────────────────────────────────────────────────────────────────────────────
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(spec, ctx, next){
        if(spec==="server-only")return{url:"data:text/javascript,export%20%7B%7D",shortCircuit:true};
        const rel = spec.startsWith("./")||spec.startsWith("../");
        const hasExt = /\\.[a-z]+$/.test(spec);
        if(rel && !hasExt){ try { return await next(spec+".ts", ctx); } catch {} }
        return next(spec, ctx);
      }`,
    ),
);

const { createClient } = await import("@supabase/supabase-js");
const { fetchQualitySnapshot } = await import("../lib/crm/quality.ts");
const { fetchAudience, fetchProfileById } = await import("../lib/crm/audience.ts");
const { fetchDashboardStats } = await import("../lib/crm/dashboard.ts");
const { fetchAuditLog } = await import("../lib/crm/audit-log.ts");

// ── Reference values, verified 2026-08-11. Update here as the data changes; the audit
//    log grows because people use the app, so audit is checked as ">0", not a fixed number.
const EXPECTED = {
  total: 82253,
  city: 5786,
  segment: 81011,
  ltvPos: 1112,
  ltvNeg: 1,
  phoneNot62: 31,
  duplicates: 15,
  orphan: 32,
  excluded: 6361,
  demographic: 0,
  behavior: 0,
  scores: 0,
  source_20fit: 81178,
  source_live: 1075,
  audience_arena: 664,
  audience_arena_norevenue: 12,
  audience_city_jakarta: 530,
};

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("✗ .env.local not found at repo root. See the header of this file.");
    process.exit(2);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ .env.local must set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

// The read layers receive a service-role client exactly as the route handlers give them.
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function auditCount() {
  const { count, error } = await admin
    .from("crm_audit_log")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

const byKey = (arr, k) => arr.find((x) => x.key === k);

const checks = [];
const check = (name, actual, expected) =>
  checks.push({ name, actual, expected, pass: actual === expected });

try {
  const auditBefore = await auditCount();

  // ── Quality snapshot (fetchQualitySnapshot) ──
  const snap = await fetchQualitySnapshot(admin);
  check("quality.total", snap.total, EXPECTED.total);
  check("quality.city filled", byKey(snap.fillRates, "city")?.filled, EXPECTED.city);
  check("quality.segment filled", byKey(snap.fillRates, "segment")?.filled, EXPECTED.segment);
  check("quality.ltv>0 filled", byKey(snap.fillRates, "lifetime_value")?.filled, EXPECTED.ltvPos);
  check("quality.phone_not_62", byKey(snap.identifiers, "phone_not_62")?.count, EXPECTED.phoneNot62);
  check("quality.ltv_negative", byKey(snap.anomalies, "ltv_negative")?.count, EXPECTED.ltvNeg);
  check("quality.flagged_duplicate", byKey(snap.duplicates, "flagged_duplicate")?.count, EXPECTED.duplicates);
  check("quality.orphan", byKey(snap.queues, "orphan")?.count, EXPECTED.orphan);
  check("quality.excluded", byKey(snap.queues, "excluded")?.count, EXPECTED.excluded);
  check("quality.demographic rows", byKey(snap.satellites, "demographic")?.rows, EXPECTED.demographic);
  check("quality.behavior rows", byKey(snap.satellites, "behavior")?.rows, EXPECTED.behavior);
  check("quality.scores rows", byKey(snap.satellites, "scores")?.rows, EXPECTED.scores);

  // ── Dashboard (fetchDashboardStats) ──
  const dash = await fetchDashboardStats(admin);
  check("dashboard.audienceSize", dash.audienceSize, EXPECTED.total);

  // ── Audience filters (fetchAudience) — only totals are read, never row contents ──
  const arena = await fetchAudience(admin, { page: 1, pageSize: 1, unit: "arena", revenue: "all" }, true);
  check("audience unit=arena", arena.total, EXPECTED.audience_arena);
  const arenaNoRev = await fetchAudience(admin, { page: 1, pageSize: 1, unit: "arena", revenue: "none" }, true);
  check("audience arena+revenue=none", arenaNoRev.total, EXPECTED.audience_arena_norevenue);
  const jkt = await fetchAudience(admin, { page: 1, pageSize: 1, city: "jakarta", revenue: "all" }, true);
  check("audience city~jakarta", jkt.total, EXPECTED.audience_city_jakarta);

  // ── Source distribution (direct count; no read layer owns this) ──
  const s1 = await admin.from("master_customer").select("*", { count: "exact", head: true }).eq("source", "20fit_data_import");
  check("source 20fit_data_import", s1.count ?? 0, EXPECTED.source_20fit);
  const s2 = await admin.from("master_customer").select("*", { count: "exact", head: true }).eq("source", "live_txn_ingest");
  check("source live_txn_ingest", s2.count ?? 0, EXPECTED.source_live);

  // ── Audit read layer (fetchAuditLog) — grows with use, so assert > 0, not a fixed count ──
  const al = await fetchAuditLog(admin, { page: 1, pageSize: 5 });
  check("audit read returns rows (>0)", al.total > 0, true);

  // ── Profile detail (fetchProfileById), masked — proves the [id] query + masking ──
  const paying = await fetchAudience(admin, { page: 1, pageSize: 1, revenue: "has" }, true);
  const sampleId = paying.rows[0]?.customer_id ?? null;
  let maskedSample = "(no row)";
  if (sampleId) {
    const prof = await fetchProfileById(admin, sampleId, true); // masked=true
    check("profile fetch by id returns the row", prof?.customer_id, sampleId);
    // PII-safe: masking is ON, so these are already disguised.
    maskedSample = `${prof?.phone ?? "—"} / ${prof?.email ?? "—"}`;
  } else {
    check("profile: had a sample id", false, true);
  }

  const auditAfter = await auditCount();
  const noWrite = auditBefore === auditAfter;

  // ── Report ──
  console.log("\n  LIVE DATA-LAYER VERIFICATION\n  " + "─".repeat(58));
  for (const c of checks) {
    const status = c.pass ? "PASS" : "FAIL";
    console.log(`  [${status}] ${c.name.padEnd(34)} got=${String(c.actual).padEnd(10)} want=${c.expected}`);
  }
  console.log("  " + "─".repeat(58));
  console.log(`  audit rows before=${auditBefore} after=${auditAfter}  -> ${noWrite ? "[PASS] no write" : "[FAIL] WROTE ROWS"}`);
  console.log(`  profile sample (masked, PII-safe): ${maskedSample}`);
  console.log("  " + "─".repeat(58));

  const failed = checks.filter((c) => !c.pass).length + (noWrite ? 0 : 1);
  console.log(failed === 0 ? "\n  ✓ ALL CHECKS PASSED\n" : `\n  ✗ ${failed} CHECK(S) FAILED\n`);
  process.exit(failed === 0 ? 0 : 1);
} catch (e) {
  console.error("\n  ✗ verification errored (not a data mismatch):", e?.message ?? e);
  process.exit(3);
}
