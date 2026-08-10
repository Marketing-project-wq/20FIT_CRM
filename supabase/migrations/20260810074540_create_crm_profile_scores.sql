-- ============================================================================
-- Tabel      : crm_profile_scores
-- Tujuan     : Skor turunan (1:1 master_customer). HANYA skor bersumber-terverifikasi.
-- Referensi  : PRD Bagian 8.7.
-- Reversible : YA — drop tabel (lihat ROLLBACK).
-- Dampak     : Nihil, aditif. FK cascade ke master_customer (referensi).
--
-- lifecycle_stage SENGAJA DIHILANGKAN (Q7-1). Menghitung active/dormant/churned
--   butuh sinyal recency andal — dan semuanya artefak (last_activity_at 99,62%,
--   customer_engagement.last_seen_at 0,49%, engagement_count 99,4% = 1). Kolom
--   kosong dengan CHECK bernama active/dormant/... adalah UNDANGAN: orang akan
--   menyimpulkan "tinggal diisi" lalu mengisinya dari satu-satunya sinyal yang
--   ada — yang artefak. Komentar tak menghentikan orang yang mengejar tenggat.
--   Kolom yang tak ada tak bisa diisi salah. Menambahkannya kelak = satu migrasi
--   kecil, dan itulah momen untuk memaksa "sinyal recency-nya sudah beres?".
--   PRASYARAT: remediasi sinyal aktivitas. (Keputusan tertunda di laporan penutup.)
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   setelah review. Kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_profile_scores (
  -- 1:1; PK = customer_id. CASCADE (K-3): skor turunan ikut terhapus dengan profil.
  customer_id     uuid primary key
                    references public.master_customer (customer_id) on delete cascade,

  -- Cross-sell — andal, dari crm_profile_behavior.unit_count (91,4% single,
  -- 8,42% multi). Vokabuler sudah tetap → boleh CHECK.
  cross_sell_tier text
                    constraint crm_profile_scores_cross_sell_tier_check
                    check (cross_sell_tier is null
                           or cross_sell_tier in ('single_unit','multi_unit')),

  -- Monetary — dari master_customer.lifetime_value (TERVERIFIKASI nyata: 214 nilai
  -- distinct, sebaran lebar; beda dari artefak yang seragam). Disimpan sebagai
  -- TIER, bukan angka. Tiga syarat (Q7-2):
  --  1) LTV negatif -> tier eksplisit tersendiri (mis. 'invalid'); JANGAN jatuh
  --     diam-diam ke bucket terendah — negatif = sinyal data bermasalah.
  --  2) BATAS tier TIDAK dikarang di skema. 1.112 pembayar & sebaran selebar ini
  --     -> kuantil lebih jujur dari angka bulat; batas diputuskan saat ingestion
  --     Sprint 3 dengan data di depan mata. Skema hanya menyimpan label — karena
  --     itu SENGAJA tanpa CHECK vokabuler (belum tetap, jangan dikunci dini).
  --  Anomali konteks (baris tunggal, tak membatalkan kolom): 1 baris -61.200.000
  --     (LTV negatif); 1 baris 251.542.200 (~10% total LTV di satu orang).
  monetary_tier   text,

  scored_at       timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.crm_profile_scores is
  'Skor turunan (1:1). Hanya sumber terverifikasi: cross_sell_tier (unit_count) & monetary_tier (lifetime_value NYATA). lifecycle_stage SENGAJA tak ada (recency = artefak; lihat header). RLS ON tanpa policy.';

comment on column public.crm_profile_scores.monetary_tier is
  'Dari master_customer.lifetime_value (nyata). LTV negatif -> tier invalid eksplisit, jangan diam-diam bucket terendah. Batas tier = kuantil, diputuskan saat ingestion (bukan di skema). Total Rp 2.520.881.225 adalah nilai TERCATAT DI CRM, BELUM direkonsiliasi dengan Finance (Viana/Mayar) — jangan dipakai sebagai angka keuangan.';

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy — akses via service role.
alter table public.crm_profile_scores enable row level security;

-- Indeks: hanya PK. Belum ada query yang membenarkan indeks lain. Tidak menebak.

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_profile_scores;
