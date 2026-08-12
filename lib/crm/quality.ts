import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QualitySnapshot } from "./quality-types";
import { fetchEcosystemQuality } from "./engagement";
import { fetchEnrichmentCoverage } from "./enrichment";
import { fetchMultiSourceCoverage } from "./multisource";
import { fetchClinicCoverage } from "./clinic-source";
import { KNOWN_TYPO_DOMAINS } from "./email-typo";

/**
 * Data-quality snapshot — READ-ONLY aggregates over the EXISTING tables.
 *
 * Same posture as lib/crm/audience.ts: server-only, service-role client passed in by
 * the caller (which owns auth + RBAC), no write path of any kind.
 *
 * WHY COUNT QUERIES AND NOT A SQL VIEW/RPC:
 * A single `crm_quality_snapshot()` function would be one round trip instead of ~20.
 * It is not used, on purpose. Creating it is DDL, and the migration ledger for this
 * project is DIVERGED (see README) — every schema change has to go through a
 * reviewed one-by-one path. This screen is pure evaluation and must not be the
 * reason someone touches that ledger. Counts via PostgREST need ZERO schema change,
 * so /quality ships and deploys with no database migration at all.
 *
 * The cost of that choice, stated plainly: two aggregates the PRD asks about cannot
 * be expressed in PostgREST — column-to-column comparison (last_activity_at =
 * first_seen_at) and regex identifier validation. Rather than approximate them and
 * present the approximation as the real number, they are moved to VERIFIED_ARTIFACTS
 * in quality-types.ts, dated, and labelled as manual verification.
 *
 * NO ROW EVER LEAVES THIS MODULE. Every query is `head: true` — Postgres returns a
 * count and nothing else, so no customer name, phone or email is read into the
 * process at all. That is why this screen needs no masking layer: there is nothing
 * to mask.
 */

type Filter = (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** COUNT(*) with an optional filter. head:true => no rows transferred, count only. */
async function countRows(
  admin: SupabaseClient,
  table: string,
  apply?: Filter,
): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** COUNT of rows where `column` IS NOT NULL. */
function notNull(column: string): Filter {
  return (q) => q.not(column, "is", null);
}

export async function fetchQualitySnapshot(admin: SupabaseClient): Promise<QualitySnapshot> {
  // Ecosystem aggregates (customer_engagement) run concurrently with the master_customer
  // counts — same posture: parameter-free, head:true, not audited (Sprint 3N).
  const ecosystemPromise = fetchEcosystemQuality(admin);
  const enrichmentCoveragePromise = fetchEnrichmentCoverage(admin);
  const multiSourceCoveragePromise = fetchMultiSourceCoverage(admin);
  const clinicCoveragePromise = fetchClinicCoverage(admin);
  const [
    total,
    fullName,
    phone,
    email,
    gender,
    dob,
    address,
    city,
    unit,
    segment,
    ltvPositive,
    phoneNot62,
    emailNoAt,
    emailKnownTypo,
    ltvNegative,
    nameWithDigits,
    flaggedDuplicate,
    merged,
    orphan,
    excluded,
    demographic,
    behavior,
    scores,
  ] = await Promise.all([
    countRows(admin, "master_customer"),
    countRows(admin, "master_customer", notNull("full_name")),
    countRows(admin, "master_customer", notNull("phone_normalized")),
    countRows(admin, "master_customer", notNull("email_normalized")),
    countRows(admin, "master_customer", notNull("gender")),
    countRows(admin, "master_customer", notNull("date_of_birth")),
    countRows(admin, "master_customer", notNull("address")),
    countRows(admin, "master_customer", notNull("city")),
    countRows(admin, "master_customer", notNull("first_unit")),
    countRows(admin, "master_customer", notNull("segment")),
    countRows(admin, "master_customer", (q) => q.gt("lifetime_value", 0)),
    // Shape checks, not full validation — see the note on each definition below.
    countRows(admin, "master_customer", (q) =>
      q.not("phone_normalized", "is", null).not("phone_normalized", "like", "62%"),
    ),
    countRows(admin, "master_customer", (q) =>
      q.not("email_normalized", "is", null).not("email_normalized", "like", "%@%.%"),
    ),
    // Emails whose domain is a KNOWN typo (systematic import corruption, e.g. gmaol.com
    // = 986 rows). Countable live via OR of "ends with @domain" (edit-distance detection
    // is per-profile only). Flagged, NEVER auto-corrected — docs/RENCANA-koreksi-kontak.md.
    countRows(admin, "master_customer", (q) =>
      q.or(Object.keys(KNOWN_TYPO_DOMAINS).map((d) => `email_normalized.like.%@${d}`).join(",")),
    ),
    countRows(admin, "master_customer", (q) => q.lt("lifetime_value", 0)),
    // Names containing a digit — almost certainly junk. PostgREST has no regex, so this is
    // the OR of ten digit-contains patterns (expressible, unlike a column regex). Flagged,
    // not fixed: master_customer is read-only and tidying happens at display (K-19 sibling).
    countRows(admin, "master_customer", (q) =>
      q.or("0123456789".split("").map((d) => `full_name.like.%${d}%`).join(",")),
    ),
    countRows(admin, "master_customer", (q) => q.is("is_potential_duplicate", true)),
    countRows(admin, "master_customer", (q) => q.is("is_merged", true)),
    countRows(admin, "customer_orphan"),
    countRows(admin, "customer_excluded"),
    countRows(admin, "crm_profile_demographic"),
    countRows(admin, "crm_profile_behavior"),
    countRows(admin, "crm_profile_scores"),
  ]);

  const ecosystem = await ecosystemPromise;
  const enrichmentCoverage = await enrichmentCoveragePromise;
  const multiSourceCoverage = await multiSourceCoveragePromise;
  const clinicCoverage = await clinicCoveragePromise;

  return {
    total,
    computedAt: new Date().toISOString(),
    ecosystem,
    enrichmentCoverage,
    multiSourceCoverage,
    clinicCoverage,

    fillRates: [
      { key: "full_name", label: "Nama", column: "full_name", filled: fullName },
      { key: "phone", label: "Telepon", column: "phone_normalized", filled: phone },
      { key: "email", label: "Email", column: "email_normalized", filled: email },
      { key: "first_unit", label: "Unit pertama", column: "first_unit", filled: unit },
      { key: "segment", label: "Segment", column: "segment", filled: segment },
      {
        key: "city",
        label: "Kota",
        column: "city",
        filled: city,
        note: "Satu-satunya sinyal geografis yang ada. Selama masih di bawah 10%, penargetan per kota tidak bisa dipertanggungjawabkan.",
      },
      {
        key: "gender",
        label: "Gender",
        column: "gender",
        filled: gender,
        note: "Kosong total di sistem lama. Perlu diisi lewat lapisan kurasi (crm_profile_demographic), bukan dengan menebak dari nama.",
      },
      {
        key: "date_of_birth",
        label: "Tanggal lahir",
        column: "date_of_birth",
        filled: dob,
        note: "Kosong total. Tanpa ini tidak ada kampanye ulang tahun dan tidak ada segmentasi usia.",
      },
      {
        key: "address",
        label: "Alamat",
        column: "address",
        filled: address,
        note: "Kosong total.",
      },
      {
        key: "lifetime_value",
        label: "Lifetime value > 0",
        column: "lifetime_value",
        filled: ltvPositive,
        note: "Bukan field kosong: nilainya ada, tetapi nol. Sisanya belum pernah tercatat membayar — “Rp 0” adalah fakta, bukan data hilang.",
      },
    ],

    identifiers: [
      {
        key: "phone_not_62",
        label: "Telepon tidak berawalan 62",
        count: phoneNot62,
        definition:
          "phone_normalized IS NOT NULL AND NOT LIKE '62%'. Pemeriksaan bentuk awalan saja — panjang dan prefiks operator tidak divalidasi di sini (PostgREST tanpa regex).",
      },
      {
        key: "email_no_at",
        label: "Email tanpa pola @domain.tld",
        count: emailNoAt,
        definition:
          "email_normalized IS NOT NULL AND NOT LIKE '%@%.%'. Ini uji bentuk paling longgar; nol di sini TIDAK berarti semua email valid atau terkirim.",
      },
      {
        key: "email_known_typo_domain",
        label: "Domain email salah ketik (daftar dikenal)",
        count: emailKnownTypo,
        definition:
          "email_normalized berakhir pada domain typo yang dikenal (gmaol.com, gmail.con, gmai.com, …). gmaol.com sendiri = 986 baris, SEMUANYA dari impor 20 April 2026 satu instan — kerusakan sistematis, bukan 986 salah ketik independen. DITANDAI, bukan diperbaiki otomatis: mengubah email atas tebakan bisa mengirim data pribadi ke orang lain (docs/RENCANA-koreksi-kontak.md).",
      },
    ],

    anomalies: [
      {
        key: "ltv_negative",
        label: "Lifetime value negatif",
        count: ltvNegative,
        definition:
          "lifetime_value < 0. Baris ini TIDAK TERLIHAT di filter revenue halaman Audience — “punya revenue” menyaring > 0 dan “tanpa revenue” menyaring 0/NULL, jadi nilai negatif jatuh di luar keduanya dan hanya muncul saat filter “Semua”. Diangkat di sini justru karena di sana ia menghilang.",
      },
      {
        key: "name_with_digits",
        label: "Nama mengandung angka",
        count: nameWithDigits,
        definition:
          "full_name mengandung minimal satu digit 0–9. Kemungkinan besar data sampah (mis. nomor antrean ikut ke kolom nama). DITANDAI, bukan diperbaiki: master_customer read-only, dan perapian nama terjadi di lapisan tampilan (lib/crm/display-name.ts), bukan dengan menebak nama yang benar.",
      },
    ],

    duplicates: [
      {
        key: "flagged_duplicate",
        label: "Ditandai kemungkinan duplikat",
        count: flaggedDuplicate,
        definition:
          "is_potential_duplicate = true. Ditandai oleh proses impor lama; belum ada alur merge/unmerge di aplikasi ini.",
      },
      {
        key: "merged",
        label: "Sudah di-merge",
        count: merged,
        definition: "is_merged = true. Nol berarti belum satu pun duplikat diselesaikan.",
      },
    ],

    queues: [
      {
        key: "orphan",
        label: "Antrean orphan",
        count: orphan,
        definition:
          "Baris di customer_orphan — data yang tidak bisa dikaitkan ke satu profil master.",
      },
      {
        key: "excluded",
        label: "Dikecualikan dari master",
        count: excluded,
        definition:
          "Baris di customer_excluded. Jumlahnya besar dan alasan pengecualian belum ditinjau ulang di sprint ini.",
      },
    ],

    satellites: [
      {
        key: "demographic",
        label: "Kurasi demografis",
        table: "crm_profile_demographic",
        rows: demographic,
        note: "Tabel sudah ada, belum diisi — ingestion masih ditahan.",
      },
      {
        key: "behavior",
        label: "Satelit perilaku",
        table: "crm_profile_behavior",
        rows: behavior,
        note: "Belum diisi. Sumber perilaku yang tersedia masih terlarang sampai diremediasi.",
      },
      {
        key: "scores",
        label: "Skor turunan",
        table: "crm_profile_scores",
        rows: scores,
        note: "Belum diisi. Semua profil belum terskor — bukan “skor basi”, melainkan skor yang belum pernah ada.",
      },
    ],
  };
}
