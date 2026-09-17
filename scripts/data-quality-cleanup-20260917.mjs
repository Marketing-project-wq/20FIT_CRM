#!/usr/bin/env node
/**
 * data-quality-cleanup-20260917.mjs — One-off data quality cleanup for master_customer.
 *
 * Investigates and fixes:
 *   A. Email addresses leaked into city column
 *   B. full_name containing email addresses (flag only, no fix)
 *   C. Gender distribution
 *   D. DOB anomalies (before 1930 or after 2015)
 *   E. Duplicate emails
 *   F. Phone anomalies (too short/long)
 *   G. Negative lifetime_value
 *   H. City duplicates / inconsistencies
 *   I. Names containing digits
 *   J. Email in city that aren't real addresses
 *
 * Then applies fixes (Steps 2-7) and prints a summary report.
 *
 * HOW TO RUN:
 *   1. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   2. node scripts/data-quality-cleanup-20260917.mjs
 *
 * SAFETY:
 *   - All updates via service_role admin client (bypasses RLS)
 *   - Idempotent — safe to re-run
 *   - NEVER deletes rows — only NULLs invalid fields
 *   - Logs every fix with row count
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("ERROR: .env.local not found at repo root.");
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
  console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function fmt(n) { return n.toLocaleString("id-ID"); }

function printTable(title, rows, columns) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(70));
  if (!rows || rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const header = cols.map((c, i) => c.padEnd(widths[i])).join(" | ");
  console.log(`  ${header}`);
  console.log(`  ${widths.map((w) => "-".repeat(w)).join("-+-")}`);
  for (const r of rows.slice(0, 50)) {
    console.log(`  ${cols.map((c, i) => String(r[c] ?? "").padEnd(widths[i])).join(" | ")}`);
  }
  if (rows.length > 50) console.log(`  ... and ${rows.length - 50} more rows`);
}

// ── Helpers: fetch in pages to avoid PostgREST row limits ────────────────────
async function fetchAll(table, select, filters) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    let q = admin.from(table).select(select, { count: "exact" }).range(offset, offset + PAGE - 1);
    if (filters) q = filters(q);
    const { data, error, count } = await q;
    if (error) throw new Error(`Query failed: ${error.message}`);
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function countWhere(table, filters) {
  let q = admin.from(table).select("customer_id", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) throw new Error(`Count failed: ${error.message}`);
  return count || 0;
}

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 1 — INVESTIGATION (read-only diagnostics)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 1 — INVESTIGATION");
console.log("#".repeat(70));

// A. Email leaked into city column
const queryA = await fetchAll("master_customer", "customer_id, full_name, email, city", (q) =>
  q.ilike("city", "%@%").ilike("city", "%.com%")
);
printTable("A. Email bocor ke kolom kota (city ILIKE '%@%' AND '%.com%')", queryA, ["customer_id", "full_name", "email", "city"]);

// B. Nama = email address
const queryB = await fetchAll("master_customer", "customer_id, full_name, email", (q) =>
  q.like("full_name", "%@%")
);
printTable("B. Nama = email address (full_name LIKE '%@%')", queryB, ["customer_id", "full_name", "email"]);

// C. Gender distribution
const allGender = await fetchAll("master_customer", "gender");
const genderCounts = {};
for (const r of allGender) {
  const g = r.gender || "(NULL)";
  genderCounts[g] = (genderCounts[g] || 0) + 1;
}
const genderRows = Object.entries(genderCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([gender, count]) => ({ gender, count: fmt(count) }));
printTable("C. Gender distribution", genderRows);

// D. DOB anomalies
const queryD = await fetchAll("master_customer", "customer_id, full_name, date_of_birth", (q) =>
  q.not("date_of_birth", "is", null).or("date_of_birth.lt.1930-01-01,date_of_birth.gt.2015-01-01")
);
printTable("D. DOB anomali (< 1930 atau > 2015)", queryD.slice(0, 20), ["customer_id", "full_name", "date_of_birth"]);
if (queryD.length > 20) console.log(`  Total anomalous DOB: ${fmt(queryD.length)}`);

// E. Duplicate emails
const allEmails = await fetchAll("master_customer", "email_normalized", (q) =>
  q.not("email_normalized", "is", null)
);
const emailCounts = {};
for (const r of allEmails) {
  emailCounts[r.email_normalized] = (emailCounts[r.email_normalized] || 0) + 1;
}
const dupeEmails = Object.entries(emailCounts)
  .filter(([, c]) => c > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([email_normalized, dupes]) => ({ email_normalized, dupes }));
printTable("E. Email duplikat", dupeEmails);

// F. Phone anomalies
const allPhones = await fetchAll("master_customer", "phone_normalized", (q) =>
  q.not("phone_normalized", "is", null)
);
const phoneAnomalies = {};
for (const r of allPhones) {
  const len = (r.phone_normalized || "").length;
  if (len < 10 || len > 15) {
    const key = `${r.phone_normalized}`;
    if (!phoneAnomalies[key]) phoneAnomalies[key] = { phone_normalized: r.phone_normalized, len, count: 0 };
    phoneAnomalies[key].count++;
  }
}
const phoneRows = Object.values(phoneAnomalies).sort((a, b) => a.len - b.len).slice(0, 20);
printTable("F. Telepon anomali (< 10 atau > 15 digit)", phoneRows);

// G. Negative lifetime value
const queryG = await fetchAll("master_customer", "customer_id, full_name, email, lifetime_value", (q) =>
  q.lt("lifetime_value", 0)
);
printTable("G. Lifetime value negatif", queryG.slice(0, 20), ["customer_id", "full_name", "email", "lifetime_value"]);

// H. City distribution (top 50)
const allCities = await fetchAll("master_customer", "city", (q) =>
  q.not("city", "is", null).neq("city", "")
);
const cityCounts = {};
for (const r of allCities) {
  cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
}
const cityRows = Object.entries(cityCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50)
  .map(([city, count]) => ({ city, count: fmt(count) }));
printTable("H. Kota duplikat/inkonsisten (top 50)", cityRows);

// I. Names containing digits
const allNames = await fetchAll("master_customer", "full_name", (q) =>
  q.not("full_name", "is", null)
);
const namesWithDigits = allNames.filter((r) => /[0-9]/.test(r.full_name || "")).length;
console.log(`\n  I. Nama mengandung angka: ${fmt(namesWithDigits)}`);

// J. Email in city (not real address)
const queryJ = await fetchAll("master_customer", "customer_id, full_name, email, city", (q) =>
  q.ilike("city", "%@%")
    .not("city", "ilike", "%apartemen%")
    .not("city", "ilike", "%jl%")
    .not("city", "ilike", "%jalan%")
);
printTable("J. Email di kolom city (bukan alamat fisik)", queryJ, ["customer_id", "full_name", "email", "city"]);


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 2 — Fix: Email bocor ke kolom kota
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 2 — Fix: Email bocor ke kolom kota");
console.log("#".repeat(70));

// Find rows where city contains an email pattern
const emailCityRows = await fetchAll("master_customer", "customer_id, city", (q) =>
  q.ilike("city", "%@%")
    .not("city", "ilike", "%apartemen%")
    .not("city", "ilike", "%jl %")
    .not("city", "ilike", "%jalan%")
);
// Filter further: must contain .com, .co.id, .ac.id, or .org
const toFixCity = emailCityRows.filter((r) => {
  const c = (r.city || "").toLowerCase();
  return c.includes(".com") || c.includes(".co.id") || c.includes(".ac.id") || c.includes(".org");
});

let step2Count = 0;
for (const r of toFixCity) {
  const { error } = await admin.from("master_customer").update({ city: null }).eq("customer_id", r.customer_id);
  if (!error) step2Count++;
}
console.log(`  Rows affected: ${fmt(step2Count)}`);


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 3 — Fix: Normalisasi nama kota duplikat
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 3 — Fix: Normalisasi nama kota");
console.log("#".repeat(70));

const cityMappings = [
  ["Kota Surabaya", "Surabaya"],
  ["Kota Bekasi", "Bekasi"],
  ["Kota Depok", "Depok"],
  ["Kota Bandung", "Bandung"],
  ["Kota Semarang", "Semarang"],
  ["Kota Sukabumi", "Sukabumi"],
  ["Unknown", null],
];

for (const [from, to] of cityMappings) {
  const { data, error } = await admin
    .from("master_customer")
    .update({ city: to })
    .eq("city", from)
    .select("customer_id");
  const count = error ? 0 : (data || []).length;
  console.log(`  "${from}" -> ${to === null ? "NULL" : `"${to}"`}: ${fmt(count)} rows`);
}


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 4 — Flag: Nama = email address (no fix, count only)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 4 — Flag: Nama = email (count only, no fix)");
console.log("#".repeat(70));

const nameIsEmail = await countWhere("master_customer", (q) => q.like("full_name", "%@%"));
console.log(`  Total profiles with full_name containing '@': ${fmt(nameIsEmail)}`);
console.log("  (Needs external data source to fix — flagged only)");


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 5 — Fix: DOB anomali
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 5 — Fix: DOB anomali (< 1930 atau > 2015 -> NULL)");
console.log("#".repeat(70));

// Re-fetch anomalous DOBs (idempotent — queryD was the investigation, re-query for fix)
const dobAnomalies = await fetchAll("master_customer", "customer_id", (q) =>
  q.not("date_of_birth", "is", null).or("date_of_birth.lt.1930-01-01,date_of_birth.gt.2015-01-01")
);

let step5Count = 0;
for (const r of dobAnomalies) {
  const { error } = await admin.from("master_customer").update({ date_of_birth: null }).eq("customer_id", r.customer_id);
  if (!error) step5Count++;
}
console.log(`  Rows affected: ${fmt(step5Count)}`);


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 6 — Fix: Lifetime value negatif
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 6 — Fix: Lifetime value negatif -> 0");
console.log("#".repeat(70));

const negLtv = await fetchAll("master_customer", "customer_id", (q) => q.lt("lifetime_value", 0));

let step6Count = 0;
for (const r of negLtv) {
  const { error } = await admin.from("master_customer").update({ lifetime_value: 0 }).eq("customer_id", r.customer_id);
  if (!error) step6Count++;
}
console.log(`  Rows affected: ${fmt(step6Count)}`);


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 7 — Fix: Telepon anomali
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 7 — Fix: Telepon anomali (< 10 atau > 15 digit -> NULL)");
console.log("#".repeat(70));

// Re-fetch all phones and find anomalies
const allPhonesForFix = await fetchAll("master_customer", "customer_id, phone_normalized", (q) =>
  q.not("phone_normalized", "is", null)
);
const phoneToFix = allPhonesForFix.filter((r) => {
  const len = (r.phone_normalized || "").length;
  return len < 10 || len > 15;
});

let step7Count = 0;
for (const r of phoneToFix) {
  const { error } = await admin.from("master_customer").update({ phone_normalized: null }).eq("customer_id", r.customer_id);
  if (!error) step7Count++;
}
console.log(`  Rows affected: ${fmt(step7Count)}`);


// ══════════════════════════════════════════════════════════════════════════════
//  STEP 8 — Summary report
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "#".repeat(70));
console.log("#  STEP 8 — Summary Report");
console.log("#".repeat(70));

const totalCount = await countWhere("master_customer", null);

const cityFill = await countWhere("master_customer", (q) => q.not("city", "is", null).neq("city", ""));
const dobFill = await countWhere("master_customer", (q) => q.not("date_of_birth", "is", null));
const emailFill = await countWhere("master_customer", (q) => q.not("email_normalized", "is", null));
const phoneFill = await countWhere("master_customer", (q) => q.not("phone_normalized", "is", null));

// Gender post-fix
const allGenderPost = await fetchAll("master_customer", "gender");
const genderPostCounts = {};
for (const r of allGenderPost) {
  const g = r.gender || "(NULL)";
  genderPostCounts[g] = (genderPostCounts[g] || 0) + 1;
}
const genderPostRows = Object.entries(genderPostCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([gender, count]) => ({ gender, count: fmt(count) }));

// Remaining email dupes
const allEmailsPost = await fetchAll("master_customer", "email_normalized", (q) =>
  q.not("email_normalized", "is", null)
);
const emailPostCounts = {};
for (const r of allEmailsPost) {
  emailPostCounts[r.email_normalized] = (emailPostCounts[r.email_normalized] || 0) + 1;
}
const remainingDupes = Object.values(emailPostCounts).filter((c) => c > 1).length;

console.log(`
  Total records:        ${fmt(totalCount)}

  Field fill rates:
  ─────────────────────────────────────────────
  City:                 ${fmt(cityFill)} / ${fmt(totalCount)} (${(cityFill * 100 / totalCount).toFixed(1)}%)
  Date of birth:        ${fmt(dobFill)} / ${fmt(totalCount)} (${(dobFill * 100 / totalCount).toFixed(1)}%)
  Email (normalized):   ${fmt(emailFill)} / ${fmt(totalCount)} (${(emailFill * 100 / totalCount).toFixed(1)}%)
  Phone (normalized):   ${fmt(phoneFill)} / ${fmt(totalCount)} (${(phoneFill * 100 / totalCount).toFixed(1)}%)

  Gender distribution (post-fix):
  ${genderPostRows.map((r) => `  ${r.gender}: ${r.count}`).join("\n  ")}

  Remaining email duplicates: ${fmt(remainingDupes)} unique emails with >1 profile

  Fixes applied:
  ─────────────────────────────────────────────
  Step 2 — Email in city -> NULL:      ${fmt(step2Count)} rows
  Step 3 — City normalization:         (see per-city counts above)
  Step 4 — Name=email flagged:         ${fmt(nameIsEmail)} (no fix, needs external data)
  Step 5 — DOB anomaly -> NULL:        ${fmt(step5Count)} rows
  Step 6 — Negative LTV -> 0:          ${fmt(step6Count)} rows
  Step 7 — Phone anomaly -> NULL:      ${fmt(step7Count)} rows
`);

console.log("Done.");
