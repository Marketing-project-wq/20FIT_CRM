-- ============================================================================
-- MIGRASI 18 · Precompute statistik dashboard saat refresh (Opsi A)
-- ----------------------------------------------------------------------------
-- Versi ledger Supabase : 20260818041017
-- Nama ledger           : precompute_dashboard_stats_at_refresh
-- Diterapkan            : 2026-08-18 04:10 lewat Supabase MCP apply_migration
--
-- SALINAN PERSIS SQL yang berjalan. Di docs/migrations-applied/, BUKAN
--   supabase/migrations/ (alasan di ../migrations-applied/README.md — db push
--   dilarang, ledger diverge). Ketiga badan fungsi di bawah diambil VERBATIM dari
--   pg_get_functiondef (katalog live), bukan dari draf percakapan — hanya ';'
--   penutup statement yang ditambahkan agar berkas ini bisa dijalankan sebagai skrip.
--
-- TUJUAN  : Dashboard hot-path membaca satu baris crm_mirror_meta (~2 ms terukur),
--   BUKAN memindai matview 82k baris tiap request (~700 ms). Angka berbentuk-cermin
--   dihitung SEKALI saat refresh, disimpan bersama refreshed_at dalam SATU transaksi
--   -> refreshed_at tak bisa berbohong tentang usia angkanya.
--
-- INVARIAN (K-19 & arsitektur dua-stempel):
--   * dashboard_stats = bentuk-cermin AS-OF refreshed_at. DILARANG membaca tabel live
--     (master_customer / crm_consent / crm_suppression) di sini — itu sinyal eligibility
--     live milik stempel waktu lain; menggabung snapshot+live diam-diam = angka bohong.
--   * Kelayakan-dihubungi (consent/suppression) tetap dihitung LIVE di query-time
--     (dashboard.ts / segment builder) — TIDAK dipindah ke sini.
--
-- CONCURRENTLY : TERBUKTI jalan di dalam plpgsql (uji langsung 2026-08-18, tanpa error
--   txn-block). Butuh unique index (crm_customer_mirror_customer_id_uidx — ada). Refresh
--   memakai diff (lebih lambat dari plain refresh secara umum) tapi pembacaan matview
--   TIDAK memblok — penting karena segment builder membaca matview LANGSUNG.
--
-- refreshed_at pakai now() (transaction_timestamp), SENGAJA bukan clock_timestamp() —
--   lihat comment on function di bawah (§4).
--
-- Keamanan (K-15): tiga fungsi -> cabut EXECUTE dari public/anon/authenticated, beri
--   service_role saja. Reader & diagnostik SECURITY INVOKER; refresh SECURITY DEFINER.
--
-- Verifikasi saat apply (2026-08-18):
--   * 6 atribut fungsi refresh IDENTIK sebelum/sesudah: secdef=t, search_path=public,
--     volatility=v, returns=timestamptz, language=plpgsql, owner=postgres.
--   * Grant ketiga fungsi: hanya postgres + service_role (anon/authenticated absen).
--   * Refresh terukur 19,467 dtk (satu sampel; pita baseline plain refresh ~24-57 dtk).
--   * Reader crm_mirror_dashboard_stats() terukur 2,428 ms.
--   * Angka acuan yang HARUS persis: total 82.253 · fitco matched 67.653 · rfm tanpa 1.332.
--     Drift diharapkan di clinic (120) & my20fit (172) — sumber di-resample tiap refresh.
--
-- Rollback: DROP kolom + kembalikan crm_refresh_customer_mirror() ke versi migrasi 15/16
--   (tanpa blok stats), lalu DROP kedua fungsi baru. (crm_mirror_meta.dashboard_stats
--   boleh di-DROP; reader/diagnostik memakainya.)
-- ============================================================================

-- ── §1 · Kolom snapshot stats ───────────────────────────────────────────────
alter table public.crm_mirror_meta
  add column if not exists dashboard_stats jsonb;

comment on column public.crm_mirror_meta.dashboard_stats is
  'Statistik dashboard berbentuk-CERMIN, dihitung SEKALI oleh crm_refresh_customer_mirror() '
  'saat refresh dan disimpan bersama refreshed_at dalam SATU transaksi -> AS-OF refreshed_at. '
  'Sumber HANYA matview crm_customer_mirror + staging_20fit_data (beku). DILARANG membaca '
  'tabel live (master_customer/crm_consent/crm_suppression) untuk mengisi kolom ini — sinyal '
  'eligibility live milik stempel waktu lain (arsitektur dua-stempel; K-19). Bentuk: '
  '{ecosystem:{hyrox,my20fit,arena,gym,clinic}, engagement:{arena,clinic,gym,event,membership}, '
  'fitco:{matched,staging_rows,staging_unique,unmatched}, rfm:{tanpa,buckets[]}}. '
  'Baca lewat crm_mirror_dashboard_stats(); drift snapshot-vs-live lewat crm_mirror_fitco_staleness().';

-- ── §2 · Fungsi (VERBATIM dari pg_get_functiondef live) ─────────────────────

CREATE OR REPLACE FUNCTION public.crm_refresh_customer_mirror()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ts    timestamptz;
  n     bigint;
  stats jsonb;
begin
  -- CONCURRENTLY: terbukti jalan di plpgsql (uji 2026-08-18). Pembacaan matview tak memblok.
  refresh materialized view concurrently public.crm_customer_mirror;
  ts := now();

  -- Hitung stats dari matview yang BARU di-refresh + staging beku. TANPA master_customer,
  -- consent, atau suppression (itu live; lihat header). Satu pass mir untuk semua filter.
  with mir as (
    select
      count(*)                                              as total,
      count(*) filter (where has_hyrox)                     as e_hyrox,
      count(*) filter (where has_my20fit)                   as e_my20fit,
      count(*) filter (where has_arena)                     as e_arena,
      count(*) filter (where has_gym)                       as e_gym,
      count(*) filter (where has_clinic)                    as e_clinic,
      count(*) filter (where engagement_arena      > 0)     as g_arena,
      count(*) filter (where engagement_clinic     > 0)     as g_clinic,
      count(*) filter (where engagement_gym        > 0)     as g_gym,
      count(*) filter (where engagement_event      > 0)     as g_event,
      count(*) filter (where engagement_membership > 0)     as g_membership,
      count(*) filter (where is_fitco_member_matched)       as fitco_matched,
      count(*) filter (where staging_rfm is null or staging_rfm = '-') as rfm_tanpa
    from public.crm_customer_mirror
  ),
  rfmb as (
    -- buckets = label RFM nyata saja; NULL & '-' MASUK ke rfm.tanpa (K-08), tak pernah jadi bucket.
    select coalesce(
      jsonb_agg(jsonb_build_object('label', label, 'count', c) order by c desc, label),
      '[]'::jsonb
    ) as buckets
    from (
      select staging_rfm as label, count(*) as c
      from public.crm_customer_mirror
      where staging_rfm is not null and staging_rfm <> '-'
      group by staging_rfm
    ) g
  ),
  fitco as (
    -- unmatched = staging_unique - matched. SAH hanya karena email_normalized UNIK di
    -- master_customer (terbukti 2026-08-14: 81.637 baris = 81.637 distinct, 0 duplikat):
    -- tiap email staging cocok <=1 baris master, jadi matched (baris master ber-flag) =
    -- jumlah email staging unik yang tercocokkan, dan staging_unique - matched = email
    -- staging TANPA padanan master = celah identity-resolution T-18. Bila keunikan itu
    -- pernah dilanggar, identitas ini PUTUS -> hitung ulang lewat anti-join eksplisit
    -- (crm_mirror_fitco_staleness()). unmatched di sini SNAPSHOT (dipajang); unmatched_live
    -- (anti-join master sekarang) sengaja TIDAK di sini — itu diagnostik terpisah.
    select
      count(*)                                                                    as staging_rows,
      count(distinct lower(btrim("Email"))) filter
        (where "Email" is not null and btrim("Email") <> '')                      as staging_unique
    from public.staging_20fit_data
    where "Fitco User" = 'Fitco User'
  )
  select
    mir.total,
    jsonb_build_object(
      'ecosystem', jsonb_build_object(
        'hyrox', mir.e_hyrox, 'my20fit', mir.e_my20fit, 'arena', mir.e_arena,
        'gym', mir.e_gym, 'clinic', mir.e_clinic
      ),
      'engagement', jsonb_build_object(
        'arena', mir.g_arena, 'clinic', mir.g_clinic, 'gym', mir.g_gym,
        'event', mir.g_event, 'membership', mir.g_membership
      ),
      'fitco', jsonb_build_object(
        'matched',        mir.fitco_matched,
        'staging_rows',   fitco.staging_rows,
        'staging_unique', fitco.staging_unique,
        'unmatched',      fitco.staging_unique - mir.fitco_matched
      ),
      'rfm', jsonb_build_object(
        'tanpa',   mir.rfm_tanpa,
        'buckets', rfmb.buckets
      )
    )
  into n, stats
  from mir, rfmb, fitco;

  update public.crm_mirror_meta
     set refreshed_at    = ts,
         row_count       = n,
         dashboard_stats = stats
   where id;

  return ts;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_mirror_dashboard_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('refreshed_at', refreshed_at, 'row_count', row_count)
         || coalesce(dashboard_stats, '{}'::jsonb)
  from public.crm_mirror_meta
  where id;
$function$;

CREATE OR REPLACE FUNCTION public.crm_mirror_fitco_staleness()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with snap as (
    select
      (dashboard_stats->'fitco'->>'matched')::bigint        as matched,
      (dashboard_stats->'fitco'->>'staging_unique')::bigint as staging_unique,
      (dashboard_stats->'fitco'->>'unmatched')::bigint      as unmatched,
      refreshed_at
    from public.crm_mirror_meta where id
  ),
  live_staging as (
    select distinct lower(btrim("Email")) as em
    from public.staging_20fit_data
    where "Fitco User" = 'Fitco User' and "Email" is not null and btrim("Email") <> ''
  ),
  live as (
    select
      (select count(*) from live_staging) as staging_unique,
      (select count(*) from live_staging s
        where exists (select 1 from public.master_customer m where m.email_normalized = s.em)) as matched
  )
  select jsonb_build_object(
    'snapshot', jsonb_build_object(
      'matched', snap.matched, 'staging_unique', snap.staging_unique,
      'unmatched', snap.unmatched, 'as_of', snap.refreshed_at
    ),
    'live', jsonb_build_object(
      'matched', live.matched, 'staging_unique', live.staging_unique,
      'unmatched', live.staging_unique - live.matched, 'computed_at', now()
    ),
    'drift', jsonb_build_object(
      'matched',   live.matched - snap.matched,
      'unmatched', (live.staging_unique - live.matched) - snap.unmatched
    )
  )
  from snap, live;
$function$;

-- ── §3 · Grants (K-15): cabut dari public/anon/authenticated, beri service_role ──
revoke all on function public.crm_mirror_dashboard_stats()  from public, anon, authenticated;
grant  execute on function public.crm_mirror_dashboard_stats()  to service_role;

revoke all on function public.crm_mirror_fitco_staleness()   from public, anon, authenticated;
grant  execute on function public.crm_mirror_fitco_staleness()   to service_role;

revoke all on function public.crm_refresh_customer_mirror() from public, anon, authenticated;
grant  execute on function public.crm_refresh_customer_mirror() to service_role;

-- ── §4 · Comment on function (ditambah 2026-08-18 lewat comment on function — BUKAN
--         redefinisi fungsi; menjelaskan pilihan now() vs clock_timestamp()) ──────
comment on function public.crm_refresh_customer_mirror() is
  'Refresh matview cermin + precompute dashboard_stats (Migrasi 18), ATOMIK dalam satu transaksi. '
  'refreshed_at = now() (transaction_timestamp) — SENGAJA BUKAN clock_timestamp(): clock_timestamp() '
  'maju selama REFRESH ... CONCURRENTLY (~19-24 dtk), sehingga akan mencap refreshed_at LEBIH BARU dari '
  'titik snapshot transaksi -> mengklaim data lebih segar dari kenyataan. now() memberi SATU stempel '
  'stabil yang dibagi refreshed_at + row_count + stats yang dihitung di transaksi yang sama, jadi cermin '
  '& stats konsisten AS-OF stempel itu (arsitektur dua-stempel; K-19). REFRESH CONCURRENTLY butuh unique '
  'index (crm_customer_mirror_customer_id_uidx) & tidak memblok pembacaan matview. SECURITY DEFINER; '
  'EXECUTE service_role saja (K-15).';
