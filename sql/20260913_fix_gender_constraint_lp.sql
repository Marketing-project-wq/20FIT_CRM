-- ============================================================================================
-- Fix gender values: M/F -> L/P + tambah CHECK constraint (13 Sep 2026).
-- --------------------------------------------------------------------------------------------
-- SUDAH DIJALANKAN 13 Sep 2026.
--
-- KONTEKS: master_customer.gender berisi campuran 'M'/'F' (warisan import lama) dan 'L'/'P'
-- (konvensi Indonesia). RPC crm_update_master_fields v2 memvalidasi ('L','P') saja; baris
-- lama dengan 'M'/'F' menyebabkan CHECK violation (23514) saat UPDATE menyentuh baris tsb.
--
-- PERUBAHAN:
--   1. UPDATE semua 'M' -> 'L', 'F' -> 'P'
--   2. DROP CHECK constraint lama (kalau ada)
--   3. ADD CHECK constraint baru: gender IN ('L','P')
--
-- JANGAN JALANKAN ULANG — sudah diterapkan.
-- ============================================================================================

-- 1. Migrasi nilai lama ke konvensi baru.
UPDATE public.master_customer SET gender = 'L' WHERE gender = 'M';
UPDATE public.master_customer SET gender = 'P' WHERE gender = 'F';

-- 2. Hapus constraint lama kalau ada (nama bisa bervariasi).
ALTER TABLE public.master_customer DROP CONSTRAINT IF EXISTS master_customer_gender_check;
ALTER TABLE public.master_customer DROP CONSTRAINT IF EXISTS chk_gender;

-- 3. Tambah CHECK constraint yang benar.
ALTER TABLE public.master_customer
  ADD CONSTRAINT master_customer_gender_check CHECK (gender IS NULL OR gender IN ('L', 'P'));
