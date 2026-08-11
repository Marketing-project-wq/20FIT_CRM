-- ============================================================================
-- Migrasi 10 : Kunci EXECUTE crm_purge_audit_log — tutup lubang keamanan yang LIVE
-- Tujuan     : Cabut EXECUTE crm_purge_audit_log(boolean) dari public/anon/authenticated;
--              sisakan HANYA service_role. Tak mengubah fungsi, tabel, atau data apa pun.
-- Reversible : Secara teknis bisa (grant ulang), tapi JANGAN — mengembalikan grant
--              terbuka = membuka kembali lubangnya. Migrasi ini tidak ikut direvert.
--
-- KENAPA MIGRASI TERPISAH (baca ini kalau kamu hanya membuka migrasi 8):
--   Migrasi 8 membuat crm_purge_audit_log tanpa mencabut EXECUTE. Supabase memberi
--   EXECUTE DEFAULT ke anon + authenticated (dan PUBLIC) pada SETIAP fungsi baru di
--   skema public. Jadi grant migrasi 8 TERBUKA — dan `revoke ... from public` saja pun
--   TIDAK cukup, karena anon/authenticated adalah grant peran EKSPLISIT, bukan lewat
--   PUBLIC. Migrasi 8 adalah catatan sejarah dan tidak diubah; koreksi ada di SINI.
--   Kalau kamu membaca migrasi 8 saja, JANGAN mengira grant-nya masih terbuka.
--
-- DAMPAK LUBANG (dikonfirmasi ke produksi 2026-08-11): crm_purge_audit_log adalah
--   SECURITY DEFINER (berjalan sebagai postgres, pemilik crm_audit_log). ia
--   MENONAKTIFKAN trigger append-only, menghapus baris audit, lalu menyalakannya lagi.
--   Dengan EXECUTE terbuka ke anon, siapa pun pemegang anon key bisa memanggil
--   POST /rest/v1/rpc/crm_purge_audit_log dengan {"dry_run": false} — tanpa login, tanpa
--   peran, melewati seluruh RBAC. Hari ini dampaknya terbatas (audit tertua 2026-08-10,
--   belum ada > 90 hari; kategori kepatuhan dikecualikan permanen), tetapi ~8 Nov 2026
--   baris operasional pertama lewat 90 hari — sejak itu anon bisa menghapus catatan
--   siapa melihat data pelanggan siapa. Ditutup sekarang, selagi dampaknya nol baris.
--
-- POLA: identik dengan penguncian migrasi 9 (crm_record/lift_suppression). Tanda tangan
--   fungsi dikonfirmasi `(boolean)` sebelum menulis — revoke pada tanda tangan salah
--   gagal DIAM-DIAM (tak ada error, hak tetap terbuka).
-- ============================================================================

revoke all on function public.crm_purge_audit_log(boolean) from public, anon, authenticated;
grant execute on function public.crm_purge_audit_log(boolean) to service_role;

-- Verifikasi (jalankan manual): proacl hanya memuat postgres & service_role, tak ada
-- `=X/postgres` telanjang (PUBLIC), tak ada anon, tak ada authenticated:
--   select proacl from pg_proc where proname='crm_purge_audit_log';
