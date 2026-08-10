-- ============================================================================
-- Tabel      : crm_consent
-- Tujuan     : Dasar hukum & status kontak per (channel, purpose) untuk tiap
--              profil. Default legacy = TIDAK boleh dikirimi marketing.
-- Referensi  : PRD Bagian 8.7; UU 27/2022 (PDP).
-- Reversible : YA — drop tabel (lihat ROLLBACK).
-- Dampak     : Nihil, aditif. Satu tabel baru + FK ke master_customer(customer_id)
--              dengan ON DELETE SET NULL (BUKAN cascade). FK hanya referensi;
--              tak mengubah master_customer.
--
-- MENUNGGU SIGN-OFF LEGAL (PRD Fase 2):
--   * K-1 on delete: dipilih SET NULL + baris DIPERTAHANKAN sebagai catatan
--     historis dasar hukum. SYARAT agar anonimisasi ini benar-benar berlaku:
--     saat customer_id di-null-kan (rutin penghapusan Sprint 3+), kolom `evidence`
--     WAJIB ikut dikosongkan/dipangkas ke bentuk tak-tertaut — form_id/message_id
--     bisa membatalkan anonimisasi bila masih tertelusuri balik lewat tabel lain.
--   * Kosakata `basis` NEEDS LEGAL INPUT: pakai daftar dasar pemrosesan UU
--     27/2022; JANGAN salin kerangka GDPR ('legitimate_interest' istilah Eropa —
--     sengaja TIDAK dipakai). Sementara hanya nilai yang jelas dibutuhkan:
--     'legacy_import_unverified' dan 'explicit_opt_in'. Sisanya setelah review.
--
-- SYARAT INTEGRITAS (K-3): setiap tulis/ubah baris konsen WAJIB satu transaksi
--   dengan penulisan crm_audit_log. Baris current-state bisa di-UPDATE → ia bukan
--   bukti; buktinya adalah audit trail. Audit best-effort = kekuatan pembuktian
--   hilang tanpa disadari.
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   setelah review. Kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_consent (
  id           uuid primary key default gen_random_uuid(),

  -- Referensi ke master_customer, ON DELETE SET NULL (BUKAN cascade). Saat profil
  -- dihapus, customer_id jadi NULL tapi baris DIPERTAHANKAN sebagai catatan
  -- historis — bermakna setelah dihapus, tanpa menyimpan identitas yang dihapus.
  customer_id  uuid references public.master_customer (customer_id) on delete set null,

  channel      text not null
                 constraint crm_consent_channel_check
                 check (channel in ('whatsapp','email','sms','phone_call')),

  -- Hanya garis marketing vs non-marketing yang legal-relevan di sini.
  -- 'transactional' = pesan operasional non-marketing untuk menjalankan
  -- layanan/transaksi (konfirmasi booking, notifikasi akun, respons layanan);
  -- 'service' sengaja DIGABUNG ke sini — pemisahannya tak menentukan dasar hukum.
  purpose      text not null
                 constraint crm_consent_purpose_check
                 check (purpose in ('marketing','transactional')),

  -- DASAR HUKUM — TERPISAH dari status. Dipisah supaya saat konsen ditarik, kita
  -- tetap tahu dasarnya SEBELUM ditarik (itu yang justru ingin dibuktikan).
  -- Kosakata NEEDS LEGAL INPUT (UU 27/2022, bukan GDPR) — lihat header.
  basis        text not null default 'legacy_import_unverified'
                 constraint crm_consent_basis_check
                 check (basis in ('legacy_import_unverified','explicit_opt_in')),

  -- STATUS keberlakuan — TERPISAH dari basis. 'withdrawn' adalah status, bukan
  -- dasar hukum. Kapan status berubah ada di crm_audit_log (lihat syarat K-3).
  status       text not null default 'active'
                 constraint crm_consent_status_check
                 check (status in ('active','withdrawn')),

  source       text,

  -- NON-PII. SYARAT K-1: saat customer_id di-null-kan, evidence WAJIB ikut
  -- dikosongkan/dipangkas ke bentuk tak-tertaut (form_id/message_id bisa
  -- me-relink identitas lewat join tabel lain dan membatalkan anonimisasi).
  evidence     jsonb,

  recorded_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Current-state: satu baris per (customer, channel, purpose). Riwayat perubahan
  -- ada di crm_audit_log, bukan di sini. (customer_id NULL untuk baris yatim
  -- pasca-hapus tidak saling bentrok — NULL diperlakukan distinct.)
  constraint crm_consent_customer_channel_purpose_key
    unique (customer_id, channel, purpose)
);

comment on table public.crm_consent is
  'Dasar hukum & status kontak per channel/purpose. RLS ON tanpa policy. basis<>status (basis dipertahankan saat withdrawn). Tulis WAJIB satu transaksi dengan crm_audit_log (K-3). K-1 (on delete/evidence) menunggu sign-off legal PRD Fase 2.';

comment on column public.crm_consent.basis is
  'Dasar hukum, terlepas dari penarikan. NEEDS LEGAL INPUT (UU 27/2022, bukan GDPR). Sementara: legacy_import_unverified, explicit_opt_in.';

comment on column public.crm_consent.evidence is
  'NON-PII. Saat customer_id di-null-kan (penghapusan), WAJIB dikosongkan/dipangkas ke bentuk tak-tertaut — form_id/message_id bisa membatalkan anonimisasi lewat join tabel lain.';

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy — nol akses klien;
-- baca/tulis hanya via service role di server.
alter table public.crm_consent enable row level security;

-- Indeks: PK + UNIQUE(customer_id, channel, purpose) sudah mengindeks akses per
-- pelanggan. Belum ada query lain yang membenarkan indeks tambahan. Tidak menebak.

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_consent;
