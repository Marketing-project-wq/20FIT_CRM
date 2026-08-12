-- ============================================================================
-- Migrasi 13 : crm_contactable_counts()
-- Tujuan     : Jumlah profil CONTACTABLE per purpose untuk DASHBOARD (jalur tanpa
--              filter). Menggantikan jalur embed ~2,9 dtk.
-- Referensi  : lib/crm/contactability-read.ts (jalur segment TETAP pakai embed —
--              kriterianya di tabel induk; JANGAN disatukan). K-03, K-07, K-15, K-26.
-- Reversible : YA — drop function (ROLLBACK di bawah). Nol data disentuh.
--
-- KENAPA RPC: aplikasi hanya bicara PostgREST (nol driver pg) → tak ada
--   count(distinct) dan tak ada `set local work_mem`. Jalur embed jadi lantai ~2,9 dtk.
--
-- BENTUK QUERY (penting — bentuk naif jauh lebih lambat):
--   `count(distinct customer_id)` di dalam `group by purpose` MEMAKSA sort seluruh
--   408.119 baris sebelum menghitung → 3,85 dtk (terukur, tumpah ke disk). Bentuk yang
--   benar: DISTINCT dulu di subquery (HashAggregate), BARU anti-join suppression dan
--   count per purpose. Terukur 12 Agu 2026: 805 ms tanpa work_mem (tumpah), dan dengan
--   `work_mem=32MB` HashAggregate distinct muat di memori (Batches: 1, 18449kB) → ~452 ms
--   panggilan hangat (instance bersama ini sangat bervariasi; rencana tetap optimal:
--   Index Only Scan, Heap Fetches 0, Batches 1).
--
-- work_mem: instance 2184 kB. HashAggregate distinct butuh ~18,5 MB untuk Batches: 1.
--   Dinaikkan ke 32MB PER TRANSAKSI (`set local`) — bukan global (instance kecil).
--
-- SUPPRESSION MENANG (K-03/K-26): profil dikeluarkan bila SALAH SATU identitasnya
--   (telepon/email di master_customer) ada di crm_suppression aktif — untuk SEMUA purpose.
--   Ini SAMA persis dengan isContactableForPurpose (per-identitas → seluruh profil gugur,
--   semua purpose), karena crm_suppression per-identitas global (D-3, tanpa kolom purpose).
--   Keputusan + test: K-26 + lib/crm/contactability.test.ts. Nol baris aktif hari ini, tapi
--   pemeriksaan tetap ada.
--
-- customer_id IS NOT NULL eksplisit: FK crm_consent ON DELETE SET NULL.
--
-- KEDUA KUNCI SELALU ADA (K-08): fungsi mengembalikan {marketing, transactional} dengan
--   nilai 0 bila purpose itu nol — JANGAN andalkan pemanggil. `0` = terukur nol; `—` =
--   tak ada sumber. Kunci hilang → pemanggil bisa salah render `—`.
--
-- BACA SAJA: nol tulis, nol audit dari dalam (K-07: agregat tanpa parameter pengguna).
--
-- KEAMANAN (K-15): SECURITY DEFINER. EXECUTE dicabut dari public/anon/authenticated;
--   hanya service_role. Pagar EXECUTE 3I harus meloloskannya.
--
-- Catatan run: TIDAK otomatis. apply_migration (BUKAN db push).
-- ============================================================================

create or replace function public.crm_contactable_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marketing integer := 0;
  v_transactional integer := 0;
begin
  -- Naikkan work_mem UNTUK TRANSAKSI INI SAJA (HashAggregate distinct muat → Batches: 1).
  set local work_mem = '32MB';

  select
    coalesce(sum(cnt) filter (where purpose = 'marketing'), 0),
    coalesce(sum(cnt) filter (where purpose = 'transactional'), 0)
  into v_marketing, v_transactional
  from (
    select c.purpose, count(*) as cnt
    from (
      -- DISTINCT dulu (HashAggregate) — hindari sort 408k baris dari count(distinct).
      select distinct purpose, customer_id
      from public.crm_consent
      where status = 'active'
        and purpose in ('marketing', 'transactional')
        and customer_id is not null              -- FK ON DELETE SET NULL
    ) c
    where not exists (                            -- SUPPRESSION MENANG (K-03/K-26)
      select 1
      from public.master_customer mc
      join public.crm_suppression s
        on s.status = 'active'
       and ( (s.identity_kind = 'phone' and s.identity_key = mc.phone_normalized)
          or (s.identity_kind = 'email' and s.identity_key = mc.email_normalized) )
      where mc.customer_id = c.customer_id
    )
    group by c.purpose
  ) g;

  -- KEDUA kunci SELALU ada (K-08), 0 = terukur nol (bukan kunci hilang).
  return jsonb_build_object('marketing', v_marketing, 'transactional', v_transactional);
end;
$$;

comment on function public.crm_contactable_counts() is
  'Jumlah profil contactable per purpose (marketing/transactional) untuk dashboard. DISTINCT-dulu lalu anti-join suppression (K-03/K-26, per-identitas→seluruh profil, semua purpose), work_mem dinaikkan per transaksi. Selalu kembalikan kedua kunci, 0 bila nol (K-08). Baca saja, nol audit (K-07). service_role only. Jalur segment TETAP pakai embed.';

-- HANYA service role (K-15).
revoke all on function public.crm_contactable_counts() from public, anon, authenticated;
grant execute on function public.crm_contactable_counts() to service_role;

-- ROLLBACK (manual — nol data disentuh):
-- drop function if exists public.crm_contactable_counts();
