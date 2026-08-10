-- ============================================================================
-- Tabel      : crm_profile_behavior
-- Tujuan     : Satelit perilaku (1:1 master_customer) — fakta perilaku teragregasi
--              yang TERBUKTI bersumber, bukan artefak impor.
-- Referensi  : PRD Bagian 8.7.
-- Reversible : YA — drop tabel (lihat ROLLBACK).
-- Dampak     : Nihil, aditif. FK cascade ke master_customer (referensi).
--
-- SUMBER TERLARANG (artefak impor — "berbohong dengan meyakinkan" karena namanya
--   terdengar sah). JANGAN turunkan field apa pun dari kolom ini sampai
--   diremediasi. Angka diverifikasi langsung 2026-08-10 agar orang berikutnya bisa
--   cek sendiri, bukan percaya begitu saja:
--     * master_customer.last_activity_at     — 99,62% == first_seen_at
--     * customer_engagement.last_seen_at      — hanya 0,49% (445/90.419) != first_seen_at;
--                                               bahkan ada baris bertanggal masa depan
--     * customer_engagement.engagement_count  — 99,4% (89.898/90.419) bernilai tepat 1;
--                                               mengukur keberadaan baris, bukan frekuensi
--
-- Karena itu DIBUANG dari desain awal: last_engagement_at, engagement_count, dan
--   first/last_booking_at + booking_count (doctor_bookings baru 1 baris;
--   pt_package_orders/gym_memberships/youngstar kosong — sumbernya belum ada).
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   setelah review. Kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_profile_behavior (
  -- 1:1; PK = customer_id. CASCADE (K-3): fakta perilaku ikut terhapus dengan
  -- profil (benar untuk hak hapus).
  customer_id         uuid primary key
                        references public.master_customer (customer_id) on delete cascade,

  -- Kapan orang ini PERTAMA masuk data kami. Dari customer_engagement.first_seen_at
  -- — bermakna (beda dari last_seen_at yang artefak). Nullable = belum dihitung.
  first_engagement_at timestamptz,

  -- Unit yang pernah di-engage. Dasar cross-sell (91,4% satu unit, 8,42% multi).
  -- Dari customer_engagement.unit. units_engaged & unit_count dihitung BERSAMA.
  units_engaged       text[],
  unit_count          integer
                        constraint crm_profile_behavior_unit_count_check
                        check (unit_count is null or unit_count >= 0),

  -- Kapan agregat ini terakhir dihitung ulang. BUKAN artefak aktivitas apa pun.
  computed_at         timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table public.crm_profile_behavior is
  'Satelit perilaku (1:1). HANYA field bersumber-terbukti. TERLARANG sebagai sumber sampai diremediasi: master_customer.last_activity_at (99,62% = first_seen_at), customer_engagement.last_seen_at (hanya 0,49% beda) & engagement_count (99,4% = 1). RLS ON tanpa policy.';

comment on column public.crm_profile_behavior.first_engagement_at is
  'Dari customer_engagement.first_seen_at — kapan pertama masuk data kami. JANGAN pakai last_seen_at (artefak: 0,49% != first_seen_at, ada tanggal masa depan).';

comment on column public.crm_profile_behavior.units_engaged is
  'Dari customer_engagement.unit. Dasar cross-sell; unit_count = jumlah unit unik (dihitung bersama units_engaged).';

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy — akses via service role.
alter table public.crm_profile_behavior enable row level security;

-- Indeks: hanya PK. Segmentasi per unit (mis. GIN atas units_engaged, atau indeks
-- atas unit_count) BELUM punya query nyata → tidak ditambah. Tidak menebak.

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_profile_behavior;
