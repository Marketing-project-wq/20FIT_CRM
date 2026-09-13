-- ============================================================================
-- Fix RLS P0-6: master_customer & customer_engagement
-- ============================================================================
-- SUDAH DIJALANKAN 13 Sep 2026
-- Referensi: docs/AUDIT-RLS-SECURITY.md §C.2
-- Alasan:   Policy authenticated_full_access memberi CRUD penuh ke semua 1.358
--           akun authenticated. Seluruh 82.830 profil PII terbuka via REST API
--           Supabase tanpa lewat aplikasi CRM.
-- ============================================================================

-- LANGKAH 1: Drop policy permissive
DROP POLICY IF EXISTS authenticated_full_access ON public.master_customer;
DROP POLICY IF EXISTS authenticated_full_access ON public.customer_engagement;

-- LANGKAH 2: Cabut grant berlebih
REVOKE ALL PRIVILEGES ON TABLE public.master_customer FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.customer_engagement FROM anon, authenticated;

-- LANGKAH 3: Pastikan service_role tetap punya akses
-- service_role memiliki BYPASSRLS, tapi tetap butuh table-level GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_customer TO service_role;
GRANT SELECT ON TABLE public.customer_engagement TO service_role;

-- VERIFIKASI: Setelah eksekusi, kedua query di bawah harus return 0 baris.
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_name IN ('master_customer', 'customer_engagement')
--   AND grantee IN ('anon', 'authenticated');
--
-- SELECT * FROM pg_policies
-- WHERE tablename IN ('master_customer', 'customer_engagement');
