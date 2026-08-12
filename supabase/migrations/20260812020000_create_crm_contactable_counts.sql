-- ============================================================================
-- Migrasi 13 : crm_contactable_counts()
-- Tujuan     : Jumlah profil CONTACTABLE per purpose untuk DASHBOARD (jalur tanpa
--              filter). Menggantikan jalur embed ~2,9 dtk yang tumpah ke disk.
-- Referensi  : lib/crm/contactability-read.ts (jalur segment TETAP pakai embed —
--              kriterianya di tabel induk; JANGAN disatukan). K-03, K-07, K-15.
-- Reversible : YA — drop function (ROLLBACK di bawah). Nol data disentuh.
--
-- KENAPA RPC: aplikasi hanya bicara PostgREST (nol driver pg) → tak ada
--   count(distinct) dan tak ada `set local work_mem`. Jalur embed jadi lantai ~2,9
--   dtk (hash join tumpah disk). Fungsi ini menjalankan count(distinct) mentah
--   (~1,3 dtk) DENGAN work_mem dinaikkan untuk transaksi ini saja.
--
-- BACA SAJA: nol tulis, nol audit dari dalam (K-07: agregat tanpa parameter
--   pengguna tidak diaudit — dipanggil dari jalur yang sudah punya aturannya).
--
-- SUPPRESSION MENANG (K-03): profil yang salah satu identitasnya (telepon/email di
--   master_customer) ada di crm_suppression aktif DIKELUARKAN. Nol baris hari ini,
--   tapi pemeriksaan tetap ada — hilang sekarang = hilang saat baris pertama masuk.
--
-- customer_id IS NOT NULL eksplisit: FK crm_consent ON DELETE SET NULL, jadi baris
--   yatim mungkin ada nanti (nol sekarang).
--
-- work_mem: instance 2184 kB; sort count(distinct) butuh ~3200 kB. Dinaikkan ke
--   16MB PER TRANSAKSI (`set local`) — bukan global (instance kecil, K-larangan).
--
-- KEAMANAN (K-15): SECURITY DEFINER. EXECUTE dicabut dari public/anon/authenticated;
--   hanya service_role. Pagar EXECUTE 3I (lib/crm/migration-execute-guard.test.ts)
--   harus meloloskannya.
--
-- Catatan run: TIDAK otomatis. Tampilkan → berhenti → apply_migration (BUKAN db push).
-- ============================================================================

create or replace function public.crm_contactable_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  -- Naikkan work_mem UNTUK TRANSAKSI INI SAJA (hindari external-merge ke disk).
  set local work_mem = '16MB';

  select coalesce(jsonb_object_agg(purpose, cnt), '{}'::jsonb) into v
  from (
    select c.purpose, count(distinct c.customer_id) as cnt
    from public.crm_consent c
    where c.status = 'active'
      and c.purpose in ('marketing', 'transactional')
      and c.customer_id is not null            -- FK ON DELETE SET NULL → baris yatim mungkin ada
      -- SUPPRESSION MENANG (K-03): keluarkan profil dengan identitas tersuppress aktif.
      and not exists (
        select 1
        from public.master_customer mc
        join public.crm_suppression s
          on s.status = 'active'
         and ( (s.identity_kind = 'phone' and s.identity_key = mc.phone_normalized)
            or (s.identity_kind = 'email' and s.identity_key = mc.email_normalized) )
        where mc.customer_id = c.customer_id
      )
    group by c.purpose
  ) t;

  return v;  -- mis. {"marketing": 82253, "transactional": 82253}; purpose 0 → absen (app default 0)
end;
$$;

comment on function public.crm_contactable_counts() is
  'Jumlah profil contactable per purpose (marketing/transactional) untuk dashboard. count(distinct customer_id) dengan work_mem dinaikkan per transaksi. Suppression dikurangkan (K-03). Baca saja, nol audit (K-07). service_role only. Jalur segment TETAP pakai embed (kriteria di tabel induk).';

-- HANYA service role (K-15) — Supabase default memberi EXECUTE ke anon/authenticated.
revoke all on function public.crm_contactable_counts() from public, anon, authenticated;
grant execute on function public.crm_contactable_counts() to service_role;

-- ROLLBACK (manual bila perlu — nol data disentuh):
-- drop function if exists public.crm_contactable_counts();
