import type { ApiResult } from "@/components/audience/profile-detail";

/**
 * Dev-only FIXTURES for the profile detail preview (app/dev/preview). No Supabase, no auth, no PII —
 * synthetic people with the same shape as /api/audience/[id]. They cover the cases this sprint
 * (K-31 + single birth date) must render honestly:
 *   1. EMPTY    — matchable but connected to nothing: the "mostly empty" 5-second test.
 *   2. FILLABLE — a view_contact caller WITHOUT view_health; DOB empty from every source.
 *   3. CLINIC   — view_health caller; clinic identity (→ Demografi) + involvement (→ Perilaku);
 *                 birth date agrees across sources (NO conflict marker).
 *   4. DOB-DIFF — birth date from NIK (Hyrox) disagrees with the import date: ONE value shown
 *                 (NIK, most reliable) with a conflict cue + the comparison behind <Why>.
 * A 3-day-stale mirror stamp on every one, so the freshness note is exercised.
 */
const STALE_REFRESHED_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

const EMPTY_ENGAGEMENT = { rows: [], totalRows: 0, units: [], hasRealActivity: false, hasFutureAnomaly: false };
const NO_ENRICHMENT = {
  matchable: true,
  hyrox: { matched: false, rows: [], hasSensitive: false, sensitive: null, nikDerived: null },
  my20fit: { matched: false, isPlusMember: null, onboardingCompleted: null, createdAt: null },
  activity: { matched: false, firstSeenAt: null, lastActiveAt: null, pingCount: null },
};

// ── 1. EMPTY — near-empty in BOTH tabs (the whole-profile 5-second test) ──────────────────────
const EMPTY: ApiResult = {
  profile: {
    customer_id: "cust_demo_empty_0001",
    full_name: "Sri Wahyuni",
    phone: null,
    email: null,
    city: null,
    first_unit: null,
    segment: null,
    lifetime_value: null,
    source: null,
    first_seen_at: "2026-04-20T00:00:00.000Z",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
    is_potential_duplicate: false,
    duplicate_reason: null,
    is_merged: false,
    notes: null,
    tags: null,
    masked: false,
  },
  canViewHealth: false,
  canSeeContact: false,
  engagement: EMPTY_ENGAGEMENT,
  enrichment: { ...NO_ENRICHMENT, matchable: false },
  multiSource: { matchable: false, sources: [] },
  clinic: null, // non-view_health/contact caller never fetches clinic
  importData: { matchable: false, matched: false, city: null, dob: null, age: null, umurSnapshot: null, rfmPaidOrder: null, programs: [], clinicalWithheld: false },
  demographic: null,
  clinicSourceLabel: "sumber ekosistem",
  mirror: { hasHyrox: false, hasMy20fit: false, hasArena: false, hasGym: false, hasClinic: false },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

// ── 2. FILLABLE — a view_contact caller WITHOUT view_health; DOB empty from every source ──────
const FILLABLE: ApiResult = {
  profile: {
    customer_id: "cust_demo_fill_0004",
    full_name: "Rangga Saputra",
    phone: "628160000005",
    email: "rangga.demo@example.com",
    city: null,
    first_unit: "membership",
    segment: "New User",
    lifetime_value: 0,
    source: "20fit_data_import",
    first_seen_at: "2026-04-20T00:00:00.000Z",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
    is_potential_duplicate: false,
    duplicate_reason: null,
    is_merged: false,
    notes: null,
    tags: null,
    masked: false,
  },
  canViewHealth: false,
  canSeeContact: true, // sees contact/identity, but NOT medical (crm_operator / data_steward shape)
  engagement: EMPTY_ENGAGEMENT,
  enrichment: NO_ENRICHMENT,
  multiSource: { matchable: true, sources: [] },
  clinic: null,
  // Matched to the import, but the import carries NO birth date / city for this person — so
  // DOB is empty from every source the caller can see: the admin-fill target.
  importData: { matchable: true, matched: true, city: null, dob: { status: "empty", raw: null, iso: null, ambiguousDayMonth: false, swapped: false, plausibility: null }, age: null, umurSnapshot: null, rfmPaidOrder: "-", programs: [], clinicalWithheld: false },
  demographic: { gated: true, gender: null, genderSource: null, dateOfBirth: null, dateOfBirthSource: null },
  clinicSourceLabel: "sumber ekosistem", // canViewHealth=false → clinic label coarsened (T-21)
  mirror: { hasHyrox: false, hasMy20fit: false, hasArena: false, hasGym: false, hasClinic: false },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

// ── 3. CLINIC — view_health caller; identity + involvement; birth date AGREES (no conflict) ───
const CLINIC: ApiResult = {
  profile: {
    customer_id: "cust_demo_clinic_0002",
    full_name: "Bagus Pratama",
    phone: "628120000002",
    email: "bagus.demo@example.com",
    city: "Jakarta",
    first_unit: "clinic",
    segment: "Fitco User",
    lifetime_value: 4200000,
    source: "20fit_data_import",
    first_seen_at: "2026-04-20T00:00:00.000Z",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    is_potential_duplicate: false,
    duplicate_reason: null,
    is_merged: false,
    notes: null,
    tags: ["klinik"],
    masked: false,
  },
  canViewHealth: true,
  canSeeContact: true,
  engagement: {
    rows: [
      { unit: "clinic", product: "Kunjungan Klinik", engagementCount: 3, firstSeenAt: "2026-05-01T00:00:00.000Z", lastSeenAt: "2026-06-10T00:00:00.000Z", source: "live_txn_sync", lastSeenClass: "real_activity" },
    ],
    totalRows: 1,
    units: ["clinic"],
    hasRealActivity: true,
    hasFutureAnomaly: false,
  },
  enrichment: NO_ENRICHMENT,
  multiSource: { matchable: true, sources: [] },
  clinic: {
    gated: true,
    matched: true,
    keyUsed: "phone",
    // Identity → Demografi (view_contact). Birth date matches the import date below (no conflict).
    sensitive: {
      nik: "3174011403880007",
      dateOfBirth: "1988-03-14T00:00:00.000Z",
      gender: "Laki-laki",
      address: "Jakarta Selatan",
      emergencyContactName: "Rina",
      emergencyContactPhone: "628130000009",
    },
    // Involvement → Perilaku (view_health).
    clinical: {
      patientCode: "PX-2291",
      counts: { bookings: 5, visits: 3, assessments: 2, screenings: 1, transactions: 4 },
      latestBooking: { bookingCode: "BK-88213", status: "selesai", date: "2026-06-10T00:00:00.000Z" },
    },
  },
  importData: { matchable: true, matched: true, city: "Jakarta", dob: { status: "parsed", raw: "1988-03-14", iso: "1988-03-14", ambiguousDayMonth: false, swapped: false, plausibility: "ok" }, age: 38, umurSnapshot: "38", rfmPaidOrder: "Fitco User", programs: [{ key: "clinic", label: "Klinik", value: "y" }], clinicalWithheld: false },
  demographic: { gated: true, gender: null, genderSource: null, dateOfBirth: null, dateOfBirthSource: null },
  clinicSourceLabel: "klinik", // canViewHealth=true → precise label
  mirror: { hasHyrox: false, hasMy20fit: false, hasArena: false, hasGym: false, hasClinic: true },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

// ── 4. DOB disagreement — NIK (Hyrox) vs import: ONE value (NIK) + a findable conflict ────────
const DOB_DIFF: ApiResult = {
  profile: {
    customer_id: "cust_demo_dob_0003",
    full_name: "Dewi Lestari",
    phone: "628140000003",
    email: "dewi.demo@example.com",
    city: "Bandung",
    first_unit: "event",
    segment: "Loyal",
    lifetime_value: 1800000,
    source: "20fit_data_import",
    first_seen_at: "2026-04-20T00:00:00.000Z",
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
    is_potential_duplicate: false,
    duplicate_reason: null,
    is_merged: false,
    notes: null,
    tags: null,
    masked: false,
  },
  canViewHealth: true,
  canSeeContact: true,
  engagement: EMPTY_ENGAGEMENT,
  enrichment: {
    matchable: true,
    hyrox: {
      matched: true,
      rows: [{ eventName: "Hyrox Jakarta 2026", kategori: "Individual", namaTim: null, posisi: null, registeredAt: "2026-05-15T00:00:00.000Z" }],
      hasSensitive: true,
      // Raw Hyrox DOB agrees with the NIK derivation (1990-05-12); the import date below is the
      // one that disagrees — so exactly ONE conflicting source is shown.
      sensitive: { nik: "3273015205900512", tglLahir: "1990-05-12", golDarah: "O", kontakDarurat: "Andi", noKontakDarurat: "628150000004" },
      nikDerived: { valid: true, gender: "female", birthDate: "1990-05-12", yearOutOfRange: false, provinceCode: "32", provinceName: "Jawa Barat", regencyCode: "3273", districtCode: "327301" },
    },
    my20fit: { matched: false, isPlusMember: null, onboardingCompleted: null, createdAt: null },
    activity: { matched: false, firstSeenAt: null, lastActiveAt: null, pingCount: null },
  },
  multiSource: {
    matchable: true,
    sources: [
      {
        key: "arena_class",
        label: "Arena — kelas",
        matched: true,
        keyUsed: "email",
        count: 3,
        rows: [
          { label: "CL-20260503-0006", status: "confirmed", extra: {}, classInfo: { resolved: true, name: "Muay Thai", scheduleDate: "2026-05-03T00:00:00.000Z", startTime: "18:00:00", endTime: "19:00:00", instructor: "Coach Rian" } },
          { label: "CL-20260510-0021", status: "confirmed", extra: {}, classInfo: { resolved: true, name: "Muay Thai", scheduleDate: "2026-05-10T00:00:00.000Z", startTime: "18:00:00", endTime: "19:00:00", instructor: "Coach Rian" } },
          { label: "CL-20260517-0044", status: "confirmed", extra: {}, classInfo: { resolved: false, name: null, scheduleDate: null, startTime: null, endTime: null, instructor: null } },
        ],
      },
    ],
  },
  clinic: { gated: true, matched: false, keyUsed: null, sensitive: null, clinical: null },
  importData: {
    matchable: true,
    matched: true,
    city: "Bandung",
    // Import parsed this as 5 Dec 1990; NIK says 12 May 1990 — a provenance disagreement. The chain
    // picks the NIK value; this one is surfaced as the conflicting source.
    dob: { status: "parsed", raw: "1990-12-05", iso: "1990-12-05", ambiguousDayMonth: true, swapped: false, plausibility: "ok" },
    age: 35,
    umurSnapshot: "35",
    rfmPaidOrder: "Loyal",
    programs: [{ key: "event", label: "Event", value: "y" }],
    clinicalWithheld: false,
  },
  demographic: { gated: true, gender: null, genderSource: null, dateOfBirth: null, dateOfBirthSource: null },
  clinicSourceLabel: "klinik",
  mirror: { hasHyrox: true, hasMy20fit: false, hasArena: true, hasGym: false, hasClinic: false },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

export const PROFILE_FIXTURES: { label: string; note: string; data: ApiResult }[] = [
  { label: "Kosong di kedua tab", note: "uji lima detik: Demografi · 0 dan Perilaku · 0 terbaca tanpa membuka tab", data: EMPTY },
  { label: "Konflik tgl lahir (NIK vs impor)", note: "satu nilai (NIK) + penanda 'sumber lain berbeda', perbandingan di balik Kenapa?", data: DOB_DIFF },
  { label: "Peran view_contact, tanpa view_health", note: "identitas terlihat, tgl lahir kosong dari semua sumber — target isian admin", data: FILLABLE },
  { label: "Klinik (view_health) — tanpa konflik", note: "identitas + volume + booking; tgl lahir impor = klinik, tanpa penanda konflik", data: CLINIC },
];
