-- ============================================================================
-- MIGRASI 17 · crm_norm_phone — guard empty-NSN (paritas dgn normalizePhoneID, K-06)
-- ----------------------------------------------------------------------------
-- Versi ledger Supabase : 20260814055353
-- Nama ledger           : crm_norm_phone_guard_empty_nsn
-- Diterapkan            : 2026-08-14 05:53 lewat Supabase MCP apply_migration
--
-- SALINAN PERSIS SQL yang diterapkan. Di docs/migrations-applied/, BUKAN
--   supabase/migrations/ (alasan di ../migrations-applied/README.md +
--   supabase/migrations/README.md — db push dilarang, ledger diverge).
--
-- KENAPA: crm_norm_phone (kanon telepon SQL, dipakai di has_clinic pada matview
--   crm_customer_mirror) menyimpang dari lib/crm/normalize.ts::normalizePhoneID.
--   TS mengembalikan NULL saat NSN kosong; SQL dulu mengembalikan '62' telanjang.
--   '62' COCOK DENGAN DIRINYA SENDIRI -> dua input rusak jadi orang yang sama
--   (pencocokan identitas palsu; T-18 sudah punya celah identitas). TS = kanon (K-06).
--
-- CATATAN: crm_norm_phone semula DIBUAT di migrasi lain yang TIDAK ada di repo
--   (definisi pra-guard hanya hidup di DB live — bagian dari utang rekonsiliasi
--   ledger↔repo). Berkas ini adalah versi TERKOREKSI (pasca migrasi 17).
--
-- Metode  : CREATE OR REPLACE (bukan drop). Satu tambahan: syarat nsn <> ''.
-- Blast   : satu-satunya konsumen DB = matview crm_customer_mirror (has_clinic sisi
--           telepon). Terverifikasi 2026-08-14: fingerprint A (cocok sisi-telepon) &
--           B (has_clinic penuh) IDENTIK sebelum/sesudah; keenam atribut fungsi
--           (IMMUTABLE, search_path, owner, secdef, leakproof, parallel) IDENTIK.
-- Reversible: CREATE OR REPLACE ke versi tanpa syarat nsn<>'' (mengembalikan bug).
-- Paritas : dikunci di lib/crm/crm-norm-phone.parity.test.ts (golden-vector + cek
--           salinan SQL ini). Jangan ubah tanpa memperbarui normalizePhoneID + test.
-- ============================================================================

create or replace function public.crm_norm_phone(raw text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when d ~ '^[0-9]+$' and nsn <> '' then '62' || nsn
    else null
  end
  from (
    select d,
           case when d like '62%' then substr(d, 3)
                when d like '0%'  then substr(d, 2)
                else d end as nsn
    from (select regexp_replace(regexp_replace(regexp_replace(coalesce(raw, ''), '[[:space:]().-]', '', 'g'), '^\+', ''), '^00', '') as d) y
  ) x;
$function$;

-- K-15 + aman untuk replay DB-baru (fungsi baru auto-dapat EXECUTE anon).
revoke all on function public.crm_norm_phone(text) from public;
revoke all on function public.crm_norm_phone(text) from anon;
revoke all on function public.crm_norm_phone(text) from authenticated;
grant execute on function public.crm_norm_phone(text) to service_role;

comment on function public.crm_norm_phone(text) is
  'Kanon telepon SQL untuk pencocokan (mis. has_clinic di crm_customer_mirror). WAJIB paritas dengan lib/crm/normalize.ts normalizePhoneID (TS = kanon, K-06). Guard empty-NSN ditambah migrasi 17 (2026-08-14): tanpa itu input degenerate (62 / 0 / +62 / spasi) jadi 62 telanjang yang cocok dengan dirinya sendiri -> pencocokan identitas palsu. Paritas diuji di lib/crm/crm-norm-phone.parity.test.ts. Jangan ubah tanpa memperbarui normalizePhoneID + test.';
