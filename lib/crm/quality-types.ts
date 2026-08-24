/**
 * Shapes + PURE helpers for the data-quality dashboard.
 *
 * Deliberately NOT `server-only`: the client component imports the field catalogue
 * and the formatting/tone helpers. The query code (service role) lives in
 * lib/crm/quality.ts, which IS server-only. Same split as audience-constants.ts.
 *
 * HONESTY RULES encoded here (Sprint 3A carried forward):
 *   - "terisi" means NOT NULL, nothing else. Verified 2026-08-11: master_customer
 *     holds no empty-string values in these columns, so NULL is the whole story and
 *     a second "" test would only add a claim we cannot express in PostgREST.
 *   - A field at 0% is REPORTED at 0%, never hidden and never omitted from the list.
 *   - Counts are never rounded away: the raw number sits next to every percentage.
 */

/** Status tones available in the design system (PRD §18.6). No new colours. */
export type Tone = "red" | "amber" | "green" | "neutral";

/** One row of the fill-rate table. */
export interface FillRate {
  key: string;
  /** Human label, Indonesian — this is an internal Indonesian-language tool. */
  label: string;
  /** The physical column the number came from, shown in mono so it is auditable. */
  column: string;
  filled: number;
  /** Why this field matters / what blocks it. Shown when the rate is poor. */
  note?: string;
}

/** A single "how many rows are wrong" figure. */
export interface IssueCount {
  key: string;
  label: string;
  count: number;
  /** Exactly what was counted — the definition, not a vibe. */
  definition: string;
}

/** Coverage of a crm_* satellite table against the master profile count. */
export interface SatelliteCoverage {
  key: string;
  label: string;
  table: string;
  rows: number;
  note: string;
}

/** One ecosystem unit's row spread in customer_engagement (Sprint 3N, live head:true count). */
export interface EcosystemUnitSpread {
  unit: string;
  rows: number;
}

/** Parameter-free ecosystem aggregates for /quality. Only what PostgREST computes live is
 *  here; the load-stamp % and distinct coverage (column-to-column / count distinct) are in
 *  VERIFIED_ARTIFACTS, dated. Shared shape so the client component can render it. */
export interface EcosystemQuality {
  totalRows: number;
  unitSpread: EcosystemUnitSpread[];
  futureDated: number;
  computedAt: string;
}

/** Enrichment source coverage (Sprint 3R) — how many profiles each unmatched source reaches
 *  via normalised-email match. Low coverage is itself a data-quality finding. */
export interface EnrichmentSourceCoverage {
  key: string;
  label: string;
  sourceRows: number;
  matchedProfiles: number;
}

/** Multi-source coverage (TUGAS 4) — arena/gym sources matched by email. `withKey` (rows that
 *  HAVE the match identifier) lets the reader tell "identifier empty" (withKey < sourceRows)
 *  from "not in master_customer" (matchedProfiles < withKey) — two causes, one symptom. */
export interface SourceCoverage {
  key: string;
  label: string;
  sourceRows: number;
  withKey: number;
  matchedProfiles: number;
  keyUsed: "email" | "phone";
}

/** Clinic coverage (TUGAS 4). Aggregate counts only — no health content, so not view_health
 *  gated. Shows why email-first fails clinic (12 vs 106) + the clinic_transactions NULL-FK
 *  finding kept SEPARATE from match rate (different cause). */
export interface ClinicCoverage {
  patientsRows: number;
  patientsWithPhone: number;
  patientsWithEmail: number;
  matchedByEmail: number;
  matchedByPhone: number;
  transactionsTotal: number;
  transactionsLinked: number;
  transactionsNullFk: number;
  sparse: { table: string; rows: number }[];
}

/** staging_20fit_data coverage + birth-date parse stats (Sprint 3Y) — computed LIVE. The
 *  distinct email-match figure (81.079 / 98,6%) is a count-distinct join that PostgREST cannot
 *  express, so it lives in VERIFIED_ARTIFACTS (dated), NOT here — same treatment as ecosystem
 *  coverage. Everything here is a cheap head:true count or a paged parse pass. */
export interface StagingImportCoverage {
  rowsTotal: number;
  withEmail: number;
  withDob: number;
  /** Parse outcomes over the filled DOB values (live paged read). */
  dobParsed: number;
  dobUnparseable: number;
  /** month ≤ 12 AND day ≤ 12 → order unverifiable; flagged, never guessed. */
  dobAmbiguousDayMonth: number;
  /** month field > 12 → stored day-first; read back correctly + flagged (0 measured 12 Agu). */
  dobSwapped: number;
  /** parsed but age out of the 10–100 window (future / too old / too young). */
  dobImplausible: number;
  /** Year cross-check vs the Umur column, computed AS-OF the import snapshot (not today). */
  umurChecked: number;
  umurYearExact: number;
  umurOffByOne: number;
  /** off by ≥ 2 years — a genuine year conflict, not snapshot drift. */
  umurConflict: number;
  rfm: { value: string; count: number }[];
  programs: { key: string; label: string; count: number; clinical: boolean }[];
}

export interface QualitySnapshot {
  /** Rows in master_customer — the denominator for every percentage below. */
  total: number;
  fillRates: FillRate[];
  identifiers: IssueCount[];
  anomalies: IssueCount[];
  duplicates: IssueCount[];
  queues: IssueCount[];
  satellites: SatelliteCoverage[];
  /** Ecosystem (customer_engagement) live aggregates — Sprint 3N. */
  ecosystem: EcosystemQuality;
  /** Enrichment source coverage (Hyrox / my20fit) — Sprint 3R, computed live. */
  enrichmentCoverage: EnrichmentSourceCoverage[];
  /** Multi-source coverage (arena/gym) — TUGAS 4, computed live. */
  multiSourceCoverage: SourceCoverage[];
  /** Clinic coverage + the clinic_transactions NULL-FK finding — TUGAS 4, computed live. */
  clinicCoverage: ClinicCoverage | null;
  /** staging_20fit_data coverage + birth-date parse stats — Sprint 3Y, computed live. */
  stagingCoverage: StagingImportCoverage | null;
  /** ISO timestamp the snapshot was computed. Never cached. */
  computedAt: string;
}

/** Percentage of `n` out of `total`, or 0 when there is nothing to divide by. */
export function pct(n: number, total: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(total) || total <= 0) return 0;
  return (n / total) * 100;
}

/**
 * Tone for a fill rate. Thresholds are OURS, not the PRD's — the PRD does not set
 * data-quality SLAs yet. They are here so the screen is readable, and they are
 * documented as provisional rather than presented as policy.
 *   ≥ 95% green · ≥ 60% amber · below that red.
 */
export function fillTone(rate: number): Tone {
  if (rate >= 95) return "green";
  if (rate >= 60) return "amber";
  return "red";
}

/**
 * Tone for a defect count. Deliberately only green (nothing wrong) or amber
 * (something to look at) — NEVER red. Red would claim a severity threshold the PRD
 * has not defined, and inventing one here would turn a guess into a policy.
 */
export function issueTone(count: number): Tone {
  return count === 0 ? "green" : "amber";
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function formatPct(rate: number): string {
  // Two decimals: 7,03% and 1,35% are the difference between "some" and "almost none".
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate)}%`;
}

/**
 * Findings that are TRUE but cannot be recomputed live through PostgREST, which has
 * no column-to-column comparison and no regex filter. They are stated with the date
 * they were verified against the database, so nobody mistakes them for live numbers.
 * If one of these is ever needed live, it needs a SQL view — not a fudged filter.
 */
export const VERIFIED_ARTIFACTS = [
  {
    key: "last_activity",
    label: "“Terakhir aktif” bukan data aktivitas",
    detail:
      "81.944 dari 82.253 baris (99,62%) punya last_activity_at yang persis sama dengan first_seen_at — artefak impor, bukan jejak aktivitas. Kolom ini sengaja tidak ditampilkan di mana pun.",
  },
  {
    key: "segment_inverted",
    label: "Segment terbalik",
    detail:
      "1.242 profil tanpa segment (NULL) justru memiliki rata-rata lifetime value tertinggi. Ditampilkan apa adanya; tidak ada aturan yang “merapikan” ini.",
  },
  {
    key: "source_two_batches",
    label: "“live_txn_ingest” adalah muatan batch, bukan feed hidup",
    detail:
      "master_customer datang sebagai DUA muatan batch, bukan satu impor dan bukan pipeline berkelanjutan: 20fit_data_import 81.178 baris (semua created_at 2026-04-20) dan live_txn_ingest 1.075 baris (semua created_at 2026-07-31 — satu instan, bukan sepekan). first_seen_at baris live_txn_ingest membentang Feb–Agu 2026 (tanggal transaksi yang di-backfill), tetapi keduanya DIMUAT sekali jalan. Jadi kartu “Profil terakhir bertambah: 31 Juli” = tanggal muatan batch terakhir, BUKAN pipeline yang telat — nama “live_txn_ingest” untuk sumber yang hanya berjalan sekali adalah label yang menyesatkan.",
  },
  {
    key: "first_seen_is_load_stamp",
    label: "“first_seen_at” adalah cap muat untuk 98,7% pool",
    detail:
      "first_seen_at hanya membawa informasi nyata pada 1.075 baris live_txn_ingest (162 hari berbeda, Feb–Agu 2026). Untuk 81.178 baris 20fit_data_import (98,69%) ia satu instan (2026-04-20), yakni cap waktu muat — bukan “pertama terlihat”. Ini membuat temuan Sprint 2 (“last_activity_at 99,62% sama dengan first_seen_at”) jadi tautologi: keduanya cap muat yang sama, bukan bukti aktivitas tak terekam. Konsekuensinya: segmentasi berbasis recency TIDAK bisa jujur dengan data hari ini. Rinciannya di docs/KOLOM-WAKTU.md.",
  },
  {
    key: "first_seen_after_created",
    label: "14 baris “pertama terlihat” setelah dibuat (kontradiksi logis)",
    detail:
      "14 baris punya first_seen_at LEBIH BARU dari created_at (selisih terbesar 7 hari 11 jam), semuanya di live_txn_ingest. Sebuah baris yang “pertama terlihat” setelah barisnya sendiri dibuat adalah kontradiksi, bukan sekadar data kotor. Seperti LTV negatif, ia tak muncul di filter layar mana pun — PostgREST tak punya perbandingan antar-kolom (pelajaran Sprint 3B), jadi diangkat di sini sebagai temuan terverifikasi, bukan filter yang dipaksakan. Diverifikasi 11 Agustus 2026.",
  },
  {
    key: "nik_derivation",
    label: "NIK Hyrox → gender + tanggal lahir (mengisi field yang 0% terisi)",
    detail:
      "Dari 1.030 NIK di cf_hyrox_participants, 971 bisa diurai (16 digit valid); 59 panjang salah, tak diurai. Menghasilkan gender (486 perempuan / 484 laki-laki) dan tanggal lahir + provinsi pendaftaran — tiga field yang 0% terisi di master_customer. Aturan abad eksplisit: yy≤11 → 2000-an, selebihnya 1900-an; hasil di luar 1946–2011 DITANDAI, bukan ditebak. Diturunkan saat tampil dari NIK (gerbang profile.view_health), NOL tulis ke master_customer. Kode kab/kec ditampilkan mentah (tak ada tabel referensi Kemendagri). Diverifikasi 11 Agustus 2026.",
  },
  {
    key: "nik_date_swap",
    label: "321 tanggal lahir tersimpan hari-bulan TERTUKAR (NIK yang benar)",
    detail:
      "Dari 967 NIK terurai yang punya tgl_lahir tersimpan: 614 cocok persis, 321 punya HARI dan BULAN tertukar di kolom tersimpan, 32 beda karena hal lain. 321 bukan salah ketik independen — bug parsing DD/MM saat impor (DD dibaca MM), pola SISTEMATIS sama seperti gmaol.com (T-16). Konsekuensi berlawanan dugaan: untuk 321 baris itu, tanggal dari NIK lebih dapat dipercaya daripada kolom tersimpan. Layar menampilkan KEDUANYA beserta asalnya — tak memilih diam-diam. Diverifikasi 11 Agustus 2026.",
  },
  {
    key: "ecosystem_last_seen_load_stamp",
    label: "“last_seen_at” ekosistem adalah cap muat untuk 99,51% baris",
    detail:
      "customer_engagement: 89.974 dari 90.419 baris (99,51%) punya last_seen_at = first_seen_at — cap waktu muat, bukan aktivitas. Hanya 444 baris (0,49%) membawa aktivitas nyata (last_seen_at > first_seen_at, ≤ hari ini), SEMUANYA dari sumber live_txn_sync dan terpusat di dua produk: Transaksi Clinic (274) dan Transaksi Arena (170). Ini KALI KEEMPAT sebuah kolom waktu ternyata cap muat (setelah created_at, first_seen_at, last_activity_at) — pola, bukan kejutan. Perbandingan antar-kolom tak bisa dihitung live lewat PostgREST; diverifikasi 11 Agustus 2026. Konsekuensi: TIDAK ada kriteria waktu di segment builder untuk ekosistem — recency di atas kolom 99,51% cap muat sama tak jujurnya dengan di master_customer (K-19).",
  },
  {
    key: "ecosystem_coverage",
    label: "82.089 dari 82.253 profil (99,80%) punya jejak ekosistem",
    detail:
      "customer_engagement mencakup 82.089 profil master berbeda dari 82.253 (99,80%; count distinct — tak bisa live via PostgREST), lewat 90.419 baris, 0 baris yatim (setiap customer_id ada di master_customer). 164 profil tidak muncul sama sekali di ekosistem. Sebaran didominasi satu produk: membership/Fitco User = 67.828 baris (75%). Diverifikasi 11 Agustus 2026.",
  },
  {
    key: "staging_email_match",
    label: "staging_20fit_data cocok 98,6% ke master lewat email",
    detail:
      "staging_20fit_data adalah impor yang SAMA dengan master_customer: 88.536 baris, 88.445 punya email; 81.079 dari 82.253 profil master (98,62%) cocok lewat email ternormalisasi (count distinct — tak bisa live via PostgREST, karena itu diangkat di sini bertanggal). Kontras tajam dengan seluruh sumber ekosistem lain digabung (Hyrox/my20fit/arena/gym/klinik = 922 profil, 1,12%). Sumber inilah yang membawa tanggal lahir (5.467 baris — master_customer 0), kota, RFM, dan keikutsertaan program. Nol tulis, nol salin: dibaca & digabung saat tampil. Diverifikasi 12 Agustus 2026.",
  },
  {
    key: "staging_dob_ambiguity",
    label: "Tanggal lahir impor: 0 tertukar terbukti, 2.232 hari-bulan ambigu",
    detail:
      "Seluruh 5.467 tgl lahir di staging_20fit_data berbentuk ISO yyyy-mm-dd dan 0 punya field bulan > 12 — jadi TIDAK ada baris yang terbukti tertukar (beda dari cf_hyrox_participants: 321 tertukar, T-16). Namun 2.232 punya field bulan DAN hari sama-sama ≤ 12: urutannya tak bisa dipastikan dari nilainya, jadi DITANDAI ambigu, tak pernah ditebak. Kolom Umur tak bisa memutus ambiguitas ini (menukar hari-bulan tak mengubah TAHUN, jadi umur tetap) — Umur hanya memvalidasi tahun: as-of snapshot impor (20 Apr 2026) 0 baris meleset ≥ 2 tahun, sisanya meleset ≤ 1 tahun (wajar karena Umur snapshot basi). Umur TIDAK dipakai sebagai umur yang ditampilkan; umur selalu dihitung ulang dari tanggal. Diverifikasi 12 Agustus 2026.",
  },
  // NOTE: `phone_canonical_gap` sengaja DIHAPUS di Sprint 3B (2026-08-11). Temuan itu
  // sudah DIPERBAIKI — normalizePhoneID() kini menghasilkan `62…` tanpa `+`, cocok
  // dengan master_customer. Temuan yang sudah ditutup tidak boleh terus tampil di layar
  // sebagai temuan aktif. Riwayatnya ada di normalize.ts dan normalize.test.ts.
] as const;

/** Date the artifacts above were checked against the live database. ISO so the client formats it
 *  per language (formatDate) — the header shows "11 Agustus 2026" (id) / "11 August 2026" (en). */
export const ARTIFACTS_VERIFIED_ON_ISO = "2026-08-11";

/**
 * CANONICAL KEY LISTS (Sprint 5B). The display STRINGS for these rows moved to the dictionary
 * (quality.fill / issue / satellite / warn / artifact), keyed by the literals below. Listing the
 * keys HERE — importable by the client component AND by quality-i18n.test.ts without a database —
 * is what lets the data-driven test fail when a row exists in the server snapshot (or in
 * VERIFIED_ARTIFACTS) but has no dictionary entry in BOTH languages. Pure literals: no query,
 * filter, order, or value depends on them (the server in quality.ts still owns those verbatim).
 */
export const FILL_KEYS = [
  "full_name", "phone", "email", "first_unit", "segment",
  "city", "gender", "date_of_birth", "address", "lifetime_value",
] as const;

/** Every IssueCount key across identifiers + anomalies + duplicates + queues (all one shape). */
export const ISSUE_KEYS = [
  "phone_not_62", "email_no_at", "email_known_typo_domain",
  "ltv_negative", "name_with_digits",
  "flagged_duplicate", "merged",
  "orphan", "excluded",
] as const;

export const SATELLITE_KEYS = ["demographic", "behavior", "scores"] as const;

/** Artifact keys, derived from the single source above so the two can never drift. */
export const ARTIFACT_KEYS = VERIFIED_ARTIFACTS.map((a) => a.key);

/** Fill keys that carry a warning note (the rest are label-only). Used to scope the data-driven
 *  test to exactly the notes that must exist in both languages. */
export const FILL_WARN_KEYS = [
  "city", "gender", "date_of_birth", "address", "lifetime_value",
] as const;
