-- ============================================================================================
-- MIGRASI 27 · Lapisan aktivitas terpadu (crm_activity_event + crm_customer_activity)
-- --------------------------------------------------------------------------------------------
-- TUJUAN: membuka kriteria waktu JUJUR (kapan bergabung, kapan terakhir aktif) di atas tabel
-- sumber yang HIDUP di Supabase — bukan snapshot beku master_customer (kolom waktunya load
-- stamp, K-19). Sumber diverifikasi live 27 Agu 2026 punya timestamp ASLI + terus terupdate
-- (clinic_bookings & my20fit_user_activity berakhir hari ini).
--
-- POLA: mengikuti crm_customer_mirror / crm_identity_candidate (migrasi 15/23) — tabel milik
-- CRM, RLS ON, 0 policy, grant service_role saja, diisi lewat fungsi rebuild idempoten, nol
-- tulis ke master_customer, nol kolom sensitif (NIK/kesehatan tak disentuh).
--
-- SUMBER + PENGHUBUNG IDENTITAS + WAKTU ASLI (diverifikasi via information_schema + range):
--   arena_bookings       email/phone    booking_date         (270 baris, s/d Des 2026*)
--   clinic_bookings      email/phone    check_in_at          (350, s/d hari ini)
--   clinic_transactions  patient_id →   created_at           (2.629, s/d Des 2026*)
--                        clinic_patients(email/phone)
--   cf_hyrox_participants email         registered_at        (1.038, s/d Des 2026*)
--   my20fit_user_activity email         last_active_at       (197, s/d hari ini)
--
-- * CACAT TANGGAL MASA DEPAN (T-14): arena/hyrox/clinic_tx punya baris s/d Des 2026. Fungsi
--   rebuild MEMBUANG occurred_at > now() — aktivitas dari masa depan bukan aktivitas. Ini
--   diangkat ke pemilik data secara terpisah; pipeline hanya melindungi diri.
--
-- IDENTITAS: email lewat normalize_email (K-35, fungsi yang sama dipakai cermin), telepon
-- lewat crm_norm_phone (K-06). Klinik: chain patient_id → clinic_patients → master. Hanya baris
-- yang RESOLVE ke customer_id yang masuk — yang tak cocok dilewati (jujur soal cakupan; angka
-- cakupan tampil di /quality). SATU baris per (customer_id, event_type, occurred_at, source).
-- ============================================================================================

-- §1 · Tabel event mentah. Satu baris = satu kejadian teraktivitas yang tercocok ke profil.
create table if not exists public.crm_activity_event (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null,
  event_type   text not null check (event_type in (
    'arena_booking', 'clinic_visit', 'clinic_txn', 'hyrox_registration', 'app_activity'
  )),
  occurred_at  timestamptz not null,
  source       text not null,
  created_at   timestamptz not null default now(),
  constraint crm_activity_event_uniq unique (customer_id, event_type, occurred_at, source)
);

create index if not exists crm_activity_event_customer_idx
  on public.crm_activity_event (customer_id, occurred_at desc);

alter table public.crm_activity_event enable row level security;
revoke all on public.crm_activity_event from public, anon, authenticated;
grant select, insert, delete on public.crm_activity_event to service_role;

-- §2 · Ringkasan per profil — inilah yang membuka kriteria waktu. joined_at = event PALING AWAL
--       (kapan orang ini pertama terlihat aktif di ekosistem), last_active_at = PALING AKHIR.
create table if not exists public.crm_customer_activity (
  customer_id    uuid primary key,
  joined_at      timestamptz not null,
  last_active_at timestamptz not null,
  event_count    integer not null default 0,
  sources        text[] not null default '{}',
  refreshed_at   timestamptz not null default now()
);

alter table public.crm_customer_activity enable row level security;
revoke all on public.crm_customer_activity from public, anon, authenticated;
grant select, insert, delete on public.crm_customer_activity to service_role;

-- §3 · Fungsi rebuild event — DELETE+INSERT idempoten (pola crm_rebuild_identity_candidates).
--       Tiap sumber diresolusi ke customer_id, occurred_at di-clamp <= now() (buang masa depan),
--       hanya baris yang tercocok yang masuk. SECURITY DEFINER + search_path terpaku (K-30).
create or replace function public.crm_rebuild_activity_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.crm_activity_event;

  insert into public.crm_activity_event (customer_id, event_type, occurred_at, source)
  -- Each source is split into an email-match branch and a phone-match branch, UNION'd — never a
  -- single OR join. OR across two columns defeats the index; two indexed lookups UNION'd is fast
  -- enough to run inside the SQL editor's timeout (K-30 perf note). DISTINCT/UNION de-dupes a row
  -- that matches on both email and phone.

  -- arena_bookings → email
  select distinct m.customer_id, 'arena_booking', ab.booking_date::timestamptz, 'arena_bookings'
    from public.arena_bookings ab
    join public.master_customer m on m.email_normalized = normalize_email(ab.email)
   where ab.booking_date is not null and ab.booking_date::timestamptz <= now()
  union
  -- arena_bookings → phone
  select distinct m.customer_id, 'arena_booking', ab.booking_date::timestamptz, 'arena_bookings'
    from public.arena_bookings ab
    join public.master_customer m on m.phone_normalized = crm_norm_phone(ab.phone)
   where ab.booking_date is not null and ab.booking_date::timestamptz <= now()

  union
  -- clinic_bookings → email
  select distinct m.customer_id, 'clinic_visit', cb.check_in_at, 'clinic_bookings'
    from public.clinic_bookings cb
    join public.master_customer m on m.email_normalized = normalize_email(cb.email::text)
   where cb.check_in_at is not null and cb.check_in_at <= now()
  union
  -- clinic_bookings → phone
  select distinct m.customer_id, 'clinic_visit', cb.check_in_at, 'clinic_bookings'
    from public.clinic_bookings cb
    join public.master_customer m on m.phone_normalized = crm_norm_phone(cb.phone::text)
   where cb.check_in_at is not null and cb.check_in_at <= now()

  union
  -- clinic_transactions → patient → email
  select distinct m.customer_id, 'clinic_txn', ct.created_at, 'clinic_transactions'
    from public.clinic_transactions ct
    join public.clinic_patients cp on cp.id = ct.patient_id
    join public.master_customer m on m.email_normalized = normalize_email(cp.email)
   where ct.patient_id is not null and ct.created_at is not null and ct.created_at <= now()
  union
  -- clinic_transactions → patient → phone
  select distinct m.customer_id, 'clinic_txn', ct.created_at, 'clinic_transactions'
    from public.clinic_transactions ct
    join public.clinic_patients cp on cp.id = ct.patient_id
    join public.master_customer m on m.phone_normalized = crm_norm_phone(cp.phone)
   where ct.patient_id is not null and ct.created_at is not null and ct.created_at <= now()

  union
  -- cf_hyrox_participants → email
  select distinct m.customer_id, 'hyrox_registration', h.registered_at, 'cf_hyrox_participants'
    from public.cf_hyrox_participants h
    join public.master_customer m on m.email_normalized = normalize_email(h.email)
   where h.registered_at is not null and h.registered_at <= now()

  union
  -- my20fit_user_activity → email (last_active_at = recency asli)
  select distinct m.customer_id, 'app_activity', ua.last_active_at, 'my20fit_user_activity'
    from public.my20fit_user_activity ua
    join public.master_customer m on m.email_normalized = normalize_email(ua.email)
   where ua.last_active_at is not null and ua.last_active_at <= now();

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.crm_rebuild_activity_events() from public, anon, authenticated;
grant execute on function public.crm_rebuild_activity_events() to service_role;

-- §4 · Fungsi refresh ringkasan per profil dari event mentah. Rebuild event dulu, lalu agregasi.
--       Satu fungsi = satu titik masuk untuk cron dan panggilan manual.
create or replace function public.crm_refresh_customer_activity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform public.crm_rebuild_activity_events();

  delete from public.crm_customer_activity;

  insert into public.crm_customer_activity (customer_id, joined_at, last_active_at, event_count, sources, refreshed_at)
  select
    customer_id,
    min(occurred_at)          as joined_at,
    max(occurred_at)          as last_active_at,
    count(*)                  as event_count,
    array_agg(distinct source) as sources,
    now()                     as refreshed_at
  from public.crm_activity_event
  group by customer_id;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.crm_refresh_customer_activity() from public, anon, authenticated;
grant execute on function public.crm_refresh_customer_activity() to service_role;

-- §5 · Jadwalkan refresh harian 03:30 WIB = 20:30 UTC (setelah mirror refresh 20:00, jadi
--       aktivitas dihitung atas master yang baru). Idempoten: unschedule dulu bila sudah ada.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-refresh-customer-activity') then
    perform cron.unschedule('crm-refresh-customer-activity');
  end if;
end $$;

select cron.schedule(
  'crm-refresh-customer-activity',
  '30 20 * * *',                                 -- 20:30 UTC daily = 03:30 WIB
  $cmd$select public.crm_refresh_customer_activity();$cmd$
);

-- §6 · Isi sekali sekarang supaya tabel tidak kosong sampai cron pertama jalan.
select public.crm_refresh_customer_activity();


