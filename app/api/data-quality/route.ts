import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canManageRoles } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One-off data quality cleanup for master_customer. Super-admin only.
 *
 * GET  /api/data-quality?mode=investigate  — read-only diagnostics
 * POST /api/data-quality?mode=fix          — apply fixes
 *
 * Idempotent — safe to re-run. Never deletes rows, only NULLs invalid fields.
 */

async function gate(): Promise<{ ok: boolean; email: string | null }> {
  const role = await getCurrentUserRole();
  if (!canManageRoles(role)) return { ok: false, email: null };
  try {
    const { data } = await createClient().auth.getUser();
    return { ok: true, email: data.user?.email ?? null };
  } catch {
    return { ok: false, email: null };
  }
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QAny = any;

async function fetchAll(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  select: string,
  filters?: (q: QAny) => QAny,
) {
  const PAGE = 1000;
  let all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    let q: QAny = admin.from(table).select(select).range(offset, offset + PAGE - 1);
    if (filters) q = filters(q);
    const { data, error } = await q;
    if (error) throw new Error(`Query failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function countWhere(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  filters?: (q: QAny) => QAny,
): Promise<number> {
  let q: QAny = admin.from(table).select("customer_id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) throw new Error(`Count failed: ${error.message}`);
  return count ?? 0;
}

function groupBy<T>(rows: T[], key: keyof T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? "(NULL)");
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function topN(counts: Record<string, number>, n: number): { key: string; count: number }[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

// ── Investigation ────────────────────────────────────────────────────────────

async function investigate(admin: ReturnType<typeof createAdminClient>) {
  const results: Record<string, unknown> = {};

  // A. Email leaked into city
  const a = await fetchAll(admin, "master_customer", "customer_id, full_name, email, city", (q) =>
    q.ilike("city", "%@%").ilike("city", "%.com%"),
  );
  results.A_email_in_city = { count: a.length, rows: a.slice(0, 20) };

  // B. Name = email
  const b = await fetchAll(admin, "master_customer", "customer_id, full_name, email", (q) =>
    q.like("full_name", "%@%"),
  );
  results.B_name_is_email = { count: b.length, rows: b.slice(0, 20) };

  // C. Gender distribution
  const genderAll = await fetchAll(admin, "master_customer", "gender");
  results.C_gender_distribution = topN(groupBy(genderAll, "gender"), 10);

  // D. DOB anomalies
  const d = await fetchAll(admin, "master_customer", "customer_id, full_name, date_of_birth", (q) =>
    q.not("date_of_birth", "is", null).or("date_of_birth.lt.1930-01-01,date_of_birth.gt.2015-01-01"),
  );
  results.D_dob_anomaly = { count: d.length, rows: d.slice(0, 20) };

  // E. Duplicate emails
  const emailAll = await fetchAll(admin, "master_customer", "email_normalized", (q) =>
    q.not("email_normalized", "is", null),
  );
  const emailCounts = groupBy(emailAll, "email_normalized");
  const dupes = Object.entries(emailCounts)
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([email, count]) => ({ email, count }));
  results.E_email_duplicates = { uniqueDupeCount: Object.values(emailCounts).filter((c) => c > 1).length, top20: dupes };

  // F. Phone anomalies
  const phoneAll = await fetchAll(admin, "master_customer", "customer_id, phone_normalized", (q) =>
    q.not("phone_normalized", "is", null),
  );
  const phoneAnomaly = phoneAll.filter((r) => {
    const len = String(r.phone_normalized ?? "").length;
    return len < 10 || len > 15;
  });
  results.F_phone_anomaly = {
    count: phoneAnomaly.length,
    samples: phoneAnomaly.slice(0, 20).map((r) => ({
      phone: r.phone_normalized,
      len: String(r.phone_normalized ?? "").length,
    })),
  };

  // G. Negative LTV
  const g = await fetchAll(admin, "master_customer", "customer_id, full_name, email, lifetime_value", (q) =>
    q.lt("lifetime_value", 0),
  );
  results.G_negative_ltv = { count: g.length, rows: g.slice(0, 20) };

  // H. City distribution top 50
  const cityAll = await fetchAll(admin, "master_customer", "city", (q) =>
    q.not("city", "is", null).neq("city", ""),
  );
  results.H_city_distribution = topN(groupBy(cityAll, "city"), 50);

  // I. Names with digits
  const nameAll = await fetchAll(admin, "master_customer", "full_name", (q) =>
    q.not("full_name", "is", null),
  );
  const namesWithDigits = nameAll.filter((r) => /[0-9]/.test(String(r.full_name ?? ""))).length;
  results.I_names_with_digits = namesWithDigits;

  // J. Email in city (not physical address)
  const j = await fetchAll(admin, "master_customer", "customer_id, full_name, email, city", (q) =>
    q.ilike("city", "%@%")
      .not("city", "ilike", "%apartemen%")
      .not("city", "ilike", "%jl%")
      .not("city", "ilike", "%jalan%"),
  );
  results.J_email_in_city_filtered = { count: j.length, rows: j.slice(0, 20) };

  return results;
}

// ── Fixes ────────────────────────────────────────────────────────────────────

async function applyFixes(admin: ReturnType<typeof createAdminClient>) {
  const log: Record<string, unknown> = {};

  // STEP 2: Email in city -> NULL
  const emailCityRows = await fetchAll(admin, "master_customer", "customer_id, city", (q) =>
    q.ilike("city", "%@%")
      .not("city", "ilike", "%apartemen%")
      .not("city", "ilike", "%jl %")
      .not("city", "ilike", "%jalan%"),
  );
  const toFixCity = emailCityRows.filter((r) => {
    const c = String(r.city ?? "").toLowerCase();
    return c.includes(".com") || c.includes(".co.id") || c.includes(".ac.id") || c.includes(".org");
  });
  let step2 = 0;
  for (const r of toFixCity) {
    const { error } = await admin.from("master_customer").update({ city: null }).eq("customer_id", r.customer_id);
    if (!error) step2++;
  }
  log.step2_email_in_city = step2;

  // STEP 3: City normalization
  const cityMappings: [string, string | null][] = [
    ["Kota Surabaya", "Surabaya"],
    ["Kota Bekasi", "Bekasi"],
    ["Kota Depok", "Depok"],
    ["Kota Bandung", "Bandung"],
    ["Kota Semarang", "Semarang"],
    ["Kota Sukabumi", "Sukabumi"],
    ["Unknown", null],
  ];
  const step3: Record<string, number> = {};
  for (const [from, to] of cityMappings) {
    const { data, error } = await admin
      .from("master_customer")
      .update({ city: to })
      .eq("city", from)
      .select("customer_id");
    step3[`${from} -> ${to ?? "NULL"}`] = error ? 0 : (data ?? []).length;
  }
  log.step3_city_normalization = step3;

  // STEP 4: Name = email (count only, no fix)
  const nameEmailCount = await countWhere(admin, "master_customer", (q) => q.like("full_name", "%@%"));
  log.step4_name_is_email_flagged = nameEmailCount;

  // STEP 5: DOB anomaly -> NULL
  const dobAnomaly = await fetchAll(admin, "master_customer", "customer_id", (q) =>
    q.not("date_of_birth", "is", null).or("date_of_birth.lt.1930-01-01,date_of_birth.gt.2015-01-01"),
  );
  let step5 = 0;
  for (const r of dobAnomaly) {
    const { error } = await admin.from("master_customer").update({ date_of_birth: null }).eq("customer_id", r.customer_id);
    if (!error) step5++;
  }
  log.step5_dob_anomaly = step5;

  // STEP 6: Negative LTV -> 0
  const negLtv = await fetchAll(admin, "master_customer", "customer_id", (q) => q.lt("lifetime_value", 0));
  let step6 = 0;
  for (const r of negLtv) {
    const { error } = await admin.from("master_customer").update({ lifetime_value: 0 }).eq("customer_id", r.customer_id);
    if (!error) step6++;
  }
  log.step6_negative_ltv = step6;

  // STEP 7: Phone anomaly -> NULL
  const phoneAll = await fetchAll(admin, "master_customer", "customer_id, phone_normalized", (q) =>
    q.not("phone_normalized", "is", null),
  );
  const phoneToFix = phoneAll.filter((r) => {
    const len = String(r.phone_normalized ?? "").length;
    return len < 10 || len > 15;
  });
  let step7 = 0;
  for (const r of phoneToFix) {
    const { error } = await admin.from("master_customer").update({ phone_normalized: null }).eq("customer_id", r.customer_id);
    if (!error) step7++;
  }
  log.step7_phone_anomaly = step7;

  // STEP 8: Summary
  const total = await countWhere(admin, "master_customer");
  const cityFill = await countWhere(admin, "master_customer", (q) => q.not("city", "is", null).neq("city", ""));
  const dobFill = await countWhere(admin, "master_customer", (q) => q.not("date_of_birth", "is", null));
  const emailFill = await countWhere(admin, "master_customer", (q) => q.not("email_normalized", "is", null));
  const phoneFill = await countWhere(admin, "master_customer", (q) => q.not("phone_normalized", "is", null));

  const genderAll = await fetchAll(admin, "master_customer", "gender");
  const genderDist = topN(groupBy(genderAll, "gender"), 10);

  const emailAll = await fetchAll(admin, "master_customer", "email_normalized", (q) =>
    q.not("email_normalized", "is", null),
  );
  const emailCounts = groupBy(emailAll, "email_normalized");
  const remainingDupes = Object.values(emailCounts).filter((c) => c > 1).length;

  log.summary = {
    total,
    fill_rates: {
      city: { filled: cityFill, total, pct: +(cityFill * 100 / total).toFixed(1) },
      date_of_birth: { filled: dobFill, total, pct: +(dobFill * 100 / total).toFixed(1) },
      email_normalized: { filled: emailFill, total, pct: +(emailFill * 100 / total).toFixed(1) },
      phone_normalized: { filled: phoneFill, total, pct: +(phoneFill * 100 / total).toFixed(1) },
    },
    gender_distribution: genderDist,
    remaining_email_duplicates: remainingDupes,
  };

  return log;
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { ok } = await gate();
  if (!ok) return NextResponse.json({ error: "denied" }, { status: 403 });

  const mode = request.nextUrl.searchParams.get("mode") || "investigate";
  const admin = createAdminClient();

  try {
    if (mode === "investigate") {
      const results = await investigate(admin);
      return NextResponse.json({ mode: "investigate", results });
    }
    return NextResponse.json({ error: "invalid mode — use ?mode=investigate" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { ok, email } = await gate();
  if (!ok) return NextResponse.json({ error: "denied" }, { status: 403 });

  const mode = request.nextUrl.searchParams.get("mode") || "fix";
  const admin = createAdminClient();

  try {
    if (mode === "fix") {
      // Audit the fix action
      try {
        await admin.from("crm_audit_log").insert({
          actor_email: email,
          action: "profile.bulk_cleanup",
          target_table: "master_customer",
          summary: "Data quality cleanup: email-in-city, city normalization, DOB anomaly, negative LTV, phone anomaly.",
        });
      } catch { /* best-effort */ }

      const results = await applyFixes(admin);
      return NextResponse.json({ mode: "fix", results });
    }
    return NextResponse.json({ error: "invalid mode — use ?mode=fix" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
