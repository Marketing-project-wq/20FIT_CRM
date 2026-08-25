-- ============================================================================
-- Cabut grant BERLEBIH anon/authenticated dari 7 tabel crm_* era-2B (T-35, B10b)
-- GATED — DITAMPILKAN, BELUM DITERAPKAN. Terapkan lewat jalur bergerbang biasa
-- (tunjukkan → konfirmasi → apply → verifikasi → catat ledger). JANGAN `db push`.
-- ----------------------------------------------------------------------------
-- LATAR (T-35): tujuh tabel crm_* yang dibuat era 2B masih memberi arwdDxtm
-- (SEMUA privilege — termasuk INSERT/UPDATE/DELETE) ke `anon` DAN `authenticated`:
--   crm_audit_log, crm_consent, crm_profile_behavior, crm_profile_demographic,
--   crm_profile_scores, crm_suppression, crm_user_role.
-- Enam tabel yang lebih baru (3H+/KIRIM/5A) sudah bersih ({postgres, service_role}).
--
-- KENAPA INI AMAN — grant itu MATI HARI INI, tapi jaraknya ke "runtuh total" = SATU policy:
--   * Ketujuh tabel: RLS ON, 0 policy → anon/authenticated tetap DITOLAK RLS meski
--     punya grant (grant ≠ akses saat RLS ON + 0 policy; ukur ulang 3Q). Jadi mencabut
--     grant TIDAK mengubah perilaku apa pun yang berjalan sekarang.
--   * Preseden nyata di proyek ini: master_customer punya `authenticated_full_access`
--     (T-17) — seseorang MEMANG pernah menambah USING(true) ke tabel ber-RLS. Kalau itu
--     terjadi pada crm_user_role, siapa pun dengan anon key bisa memberi dirinya
--     super_admin; pada crm_suppression, orang bisa menghapus dirinya dari daftar
--     berhenti atau memasukkan orang lain. Grant nol menutup ledakan itu di sumbernya.
--
-- PERIKSA KETERGANTUNGAN (dijalankan 25 Agu 2026, sebelum berkas ini ditulis):
--   * 0 policy pada ketujuh tabel  → tak ada policy yang menyebut anon/authenticated.
--   * 0 view dimiliki anon/authenticated → tak ada view security_invoker bergantung grant.
--   * 0 keanggotaan role mewarisi anon/authenticated → tak ada peran lain menumpang.
--   * 248 baris crm_profile_demographic ditulis lewat BYPASSRLS (service_role/postgres),
--     yang TETAP punya grant → mencabut anon/authenticated tak memutus jalur itu.
--   Aplikasi CRM sendiri menyambung sebagai service_role (admin client) untuk semua
--   baca/tulis crm_* → tak bergantung pada grant anon/authenticated.
--
-- LINGKUP: hanya CABUT privilege dari anon/authenticated. TIDAK menyentuh data, RLS,
-- policy, atau grant service_role/postgres. Idempoten (REVOKE aman diulang).
-- ============================================================================

revoke all privileges on table public.crm_audit_log        from anon, authenticated;
revoke all privileges on table public.crm_consent           from anon, authenticated;
revoke all privileges on table public.crm_profile_behavior  from anon, authenticated;
revoke all privileges on table public.crm_profile_demographic from anon, authenticated;
revoke all privileges on table public.crm_profile_scores    from anon, authenticated;
revoke all privileges on table public.crm_suppression       from anon, authenticated;
revoke all privileges on table public.crm_user_role         from anon, authenticated;

-- VERIFIKASI (jalankan setelah apply — harus 0 baris):
--   select c.relname, c.relacl::text
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relname like 'crm_%'
--     and (c.relacl::text like '%anon=%' or c.relacl::text like '%authenticated=%');
--   -- Sesudahnya SEMUA 13 tabel crm_* harus {postgres, service_role} saja.
--
-- ROLLBACK (hanya bila sesuatu di luar CRM ternyata bergantung — tak ada yang ditemukan):
--   grant all privileges on table public.crm_audit_log,           public.crm_consent,
--     public.crm_profile_behavior, public.crm_profile_demographic, public.crm_profile_scores,
--     public.crm_suppression,      public.crm_user_role
--   to anon, authenticated;
