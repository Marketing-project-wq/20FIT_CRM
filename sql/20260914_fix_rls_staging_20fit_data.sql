-- ============================================================================
-- Fix RLS T-02: staging_20fit_data
-- ============================================================================
-- SUDAH DIJALANKAN 14 Sep 2026
-- Referensi: docs/AUDIT-RLS-SECURITY.md §A.4, §E
-- Alasan:   staging_20fit_data (88.536 baris PII — email, nama, telepon,
--           tanggal lahir, RFM, program) memiliki RLS OFF. Siapa pun dengan
--           anon key bisa akses langsung via PostgREST, bypass masking dan
--           audit CRM sepenuhnya.
-- Dampak:   Kode CRM menggunakan service_role (bypass RLS) — tidak terpengaruh.
--           Authenticated user mendapat read-only (SELECT) via policy.
--           Anon diblokir total.
-- ============================================================================

-- LANGKAH 1: Enable RLS
ALTER TABLE public.staging_20fit_data ENABLE ROW LEVEL SECURITY;

-- LANGKAH 2: Cabut semua grant dari anon
REVOKE ALL PRIVILEGES ON TABLE public.staging_20fit_data FROM anon;

-- LANGKAH 3: Cabut semua grant dari authenticated, kemudian berikan SELECT saja
REVOKE ALL PRIVILEGES ON TABLE public.staging_20fit_data FROM authenticated;
GRANT SELECT ON TABLE public.staging_20fit_data TO authenticated;

-- LANGKAH 4: Policy read-only untuk authenticated
CREATE POLICY authenticated_read_only ON public.staging_20fit_data
  FOR SELECT
  TO authenticated
  USING (true);

-- LANGKAH 5: Pastikan service_role tetap punya akses penuh
-- service_role memiliki BYPASSRLS, tapi grant eksplisit mengikuti pola crm_*.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staging_20fit_data TO service_role;

-- VERIFIKASI: Setelah eksekusi, jalankan query berikut.
--
-- 1. Harus 0 baris untuk anon:
-- SELECT grantee, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_name = 'staging_20fit_data'
--   AND grantee = 'anon';
--
-- 2. Harus hanya SELECT untuk authenticated:
-- SELECT grantee, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_name = 'staging_20fit_data'
--   AND grantee = 'authenticated';
--
-- 3. RLS harus ON:
-- SELECT relname, relrowsecurity
-- FROM pg_class WHERE relname = 'staging_20fit_data';
-- → relrowsecurity = true
--
-- 4. Policy harus ada:
-- SELECT policyname, permissive, roles, cmd
-- FROM pg_policies WHERE tablename = 'staging_20fit_data';
-- → authenticated_read_only, PERMISSIVE, {authenticated}, SELECT
