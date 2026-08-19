import type { ApiResult } from "@/components/audience/profile-detail";

/**
 * Dev-only FIXTURES for the profile detail preview (app/dev/preview). No Supabase, no auth, no PII —
 * synthetic people with the same shape as /api/audience/[id]. The three cover the hard cases the
 * simplification (Sprint 5B) is meant to render honestly:
 *   1. EMPTY   — matchable but connected to nothing: the "mostly empty" 5-second test.
 *   2. CLINIC  — view_health caller, clinic identity + counts behind the gate.
 *   3. DOB-DIFF — birth date from NIK (Hyrox) disagrees with the import date; both shown, not picked.
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
  engagement: EMPTY_ENGAGEMENT,
  enrichment: { ...NO_ENRICHMENT, matchable: false },
  multiSource: { matchable: false, sources: [] },
  clinic: null, // non-view_health caller never fetches clinic
  importData: { matchable: false, matched: false, city: null, dob: null, age: null, umurSnapshot: null, rfmPaidOrder: null, programs: [], clinicalWithheld: false },
  mirror: { hasHyrox: false, hasMy20fit: false, hasArena: false, hasGym: false, hasClinic: false },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

// ── 1b. FILLABLE — has contact, but gender/DOB empty from every source (admin-fill target) ────
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
  engagement: EMPTY_ENGAGEMENT,
  enrichment: NO_ENRICHMENT,
  multiSource: { matchable: true, sources: [] },
  clinic: null,
  // Matched to the import, but the import carries NO birth date / city for this person — so
  // gender/DOB/city are empty from every source: exactly the admin-fill target (TUGAS 4).
  importData: { matchable: true, matched: true, city: null, dob: { status: "empty", raw: null, iso: null, ambiguousDayMonth: false, swapped: false, plausibility: null }, age: null, umurSnapshot: null, rfmPaidOrder: "-", programs: [], clinicalWithheld: false },
  mirror: { hasHyrox: false, hasMy20fit: false, hasArena: false, hasGym: false, hasClinic: false },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

// ── 2. CLINIC behind view_health gate ────────────────────────────────────────────────────────
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
    patientCode: "PX-2291",
    sensitive: {
      nik: "3174xxxxxxxx0007",
      dateOfBirth: "1988-03-14T00:00:00.000Z",
      gender: "Laki-laki",
      address: "Jakarta Selatan",
      emergencyContactName: "Rina",
      emergencyContactPhone: "628130000009",
    },
    counts: { bookings: 5, visits: 3, assessments: 2, screenings: 1, transactions: 4 },
    latestBooking: { bookingCode: "BK-88213", status: "selesai", date: "2026-06-10T00:00:00.000Z" },
  },
  importData: { matchable: true, matched: true, city: "Jakarta", dob: { status: "parsed", raw: "14/03/1988", iso: "1988-03-14", ambiguousDayMonth: false, swapped: false, plausibility: "ok" }, age: 38, umurSnapshot: "38", rfmPaidOrder: "Fitco User", programs: [{ key: "clinic", label: "Klinik", value: "y" }], clinicalWithheld: false },
  mirror: { hasHyrox: false, hasMy20fit: false, hasArena: false, hasGym: false, hasClinic: true },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

// ── 3. DOB disagreement — NIK (Hyrox) vs import ──────────────────────────────────────────────
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
  engagement: EMPTY_ENGAGEMENT,
  enrichment: {
    matchable: true,
    hyrox: {
      matched: true,
      rows: [{ eventName: "Hyrox Jakarta 2026", kategori: "Individual", namaTim: null, posisi: null, registeredAt: "2026-05-15T00:00:00.000Z" }],
      hasSensitive: true,
      sensitive: { nik: "3273xxxxxxxx0512", tglLahir: "05/12/1990", golDarah: "O", kontakDarurat: "Andi", noKontakDarurat: "628150000004" },
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
  clinic: { gated: true, matched: false, keyUsed: null, patientCode: null, sensitive: null, counts: null, latestBooking: null },
  importData: {
    matchable: true,
    matched: true,
    city: "Bandung",
    // Import parsed this as 12 May; NIK says 12 December — provenance disagreement, both shown.
    dob: { status: "parsed", raw: "12/05/1990", iso: "1990-12-05", ambiguousDayMonth: true, swapped: false, plausibility: "ok" },
    age: 35,
    umurSnapshot: "35",
    rfmPaidOrder: "Loyal",
    programs: [{ key: "event", label: "Event", value: "y" }],
    clinicalWithheld: false,
  },
  mirror: { hasHyrox: true, hasMy20fit: false, hasArena: true, hasGym: false, hasClinic: false },
  mirrorRefreshedAt: STALE_REFRESHED_AT,
};

export const PROFILE_FIXTURES: { label: string; note: string; data: ApiResult }[] = [
  { label: "Kosong di kedua tab", note: "uji lima detik: Demografi · 0 dan Perilaku · 0 terbaca tanpa membuka tab", data: EMPTY },
  { label: "Perilaku berisi, Demografi tipis", note: "kelas + Hyrox + impor terisi; kontak tipis, tgl lahir NIK vs impor berbeda", data: DOB_DIFF },
  { label: "Demografi bisa diisi admin", note: "gender/tgl lahir/kota kosong dari semua sumber — target isian admin (TUGAS 4)", data: FILLABLE },
  { label: "Data klinis di balik gerbang", note: "canViewHealth = true: identitas + volume + booking, tanpa isi klinis", data: CLINIC },
];
