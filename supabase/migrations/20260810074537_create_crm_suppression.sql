-- ============================================================================
-- Tabel      : crm_suppression
-- Tujuan     : Daftar do-not-contact. MENANG atas semua consent. Di-key pada
--              IDENTITAS KONTAK (bukan customer_id) agar bertahan lintas
--              penghapusan profil & impor ulang.
-- Referensi  : PRD Bagian 8.7; UU 27/2022 (PDP).
-- Reversible : YA — drop tabel (lihat ROLLBACK).
-- Dampak     : Nihil, aditif. Satu tabel baru, TANPA FK (customer_id hanya soft
--              ref informatif). Tidak menyentuh master_customer/tabel lain.
--
-- D-1 identity_key = PLAINTEXT ternormalisasi (bukan hash). Alasan: ruang nomor
--   ID kecil (puluhan juta) & kunci+DB satu proses → "DB bocor, kunci tidak"
--   bukan ancaman realistis; dan daftar ini HARUS bisa diperiksa manusia saat ada
--   komplain (yang sulit diperiksa berhenti diperiksa). Kompensasi: RLS nol
--   policy + service role + SETIAP pembacaan masuk crm_audit_log (di kode).
--
-- D-2 (titik gagal paling berbahaya): identity_key WAJIB diproduksi oleh SATU
--   fungsi normalisasi kanonik (lib/crm/normalize.ts) yang SAMA PERSIS dipakai
--   ingestion maupun pengecekan suppression, dan konsisten dengan
--   master_customer.phone_normalized/email_normalized. JANGAN menormalkan di SQL
--   (itu jadi implementasi kedua). Beda satu kasus (0 vs 62, email kapital) =
--   suppression gagal cocok DIAM-DIAM. Wajib ada test varian nomor Indonesia.
--
-- D-4 daur hidup: suppression STICKY. Pencabutan sah ada (orang mendaftar ulang),
--   tapi lewat status='lifted' + lifted_at + lifted_reason + audit — BUKAN
--   hard-delete. DELETE dilarang di lapisan aplikasi (menghapus = menghubungi
--   lagi orang yang menolak, tanpa jejak).
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   setelah review. Kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_suppression (
  id             uuid primary key default gen_random_uuid(),

  -- KUNCI DURABLE = identitas kontak (D-3: per identitas, bukan per channel; satu
  -- telepon disuppress → semua kanal berbasis telepon). BUKAN customer_id.
  identity_kind  text not null
                   constraint crm_suppression_identity_kind_check
                   check (identity_kind in ('phone','email')),
  identity_key   text not null,   -- PLAINTEXT ternormalisasi via lib/crm/normalize.ts (D-1/D-2)

  -- Referensi informatif, nullable, BUKAN kunci, BUKAN FK — suppression hidup
  -- independen dari master_customer (bertahan walau profil dihapus/diimpor ulang).
  customer_id    uuid,

  -- Alasan WAJIB (Q3). 'unknown' sengaja TIDAK ada — alasan wajib kehilangan makna
  -- bila ada nilai yang artinya "tak diisi". Impor legacy tanpa alasan diketahui
  -- pakai 'legacy_import' (jujur, bukan menyamar).
  reason_code    text not null
                   constraint crm_suppression_reason_code_check
                   check (reason_code in ('user_request','complaint','bounce','legal','legacy_import')),
  reason_detail  text,

  -- Daur hidup (D-4). 'lifted' = pencabutan sah tercatat; baris TETAP ada.
  status         text not null default 'active'
                   constraint crm_suppression_status_check
                   check (status in ('active','lifted')),
  lifted_at      timestamptz,
  lifted_reason  text,

  source         text,
  created_at     timestamptz not null default now(),

  -- Satu baris per identitas + indeks lookup "apakah kontak ini disuppress?".
  constraint crm_suppression_identity_key
    unique (identity_kind, identity_key)
);

comment on table public.crm_suppression is
  'Do-not-contact, MENANG atas semua consent (ditegakkan di kode). Di-key pada identitas kontak plaintext ternormalisasi (bukan customer_id). Sticky: cabut via status=lifted + audit, DELETE dilarang di aplikasi. Setiap pembacaan wajib masuk audit.';

comment on column public.crm_suppression.identity_key is
  'PLAINTEXT ternormalisasi. WAJIB dari SATU fungsi kanonik (lib/crm/normalize.ts), sama persis dengan ingestion & master_customer; JANGAN normalkan di SQL. Beda satu kasus = suppression gagal cocok diam-diam.';

comment on column public.crm_suppression.status is
  'active = menang atas consent. lifted = pencabutan sah tercatat (lifted_at/lifted_reason), baris dipertahankan. DELETE dilarang di aplikasi.';

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy — nol akses klien;
-- baca/tulis hanya via service role di server (dan pembacaan dicatat ke audit).
alter table public.crm_suppression enable row level security;

-- Indeks: PK + UNIQUE(identity_kind, identity_key) sudah melayani lookup inti
-- ("apakah kontak ini disuppress?"). Tidak menambah indeks lain. Tidak menebak.

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_suppression;
