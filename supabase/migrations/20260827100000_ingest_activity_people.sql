-- ============================================================================================
-- MIGRASI 28 · Ingest orang AKTIF ke master_customer (Opsi A — cakupan aktivitas)
-- --------------------------------------------------------------------------------------------
-- TUJUAN: membuat profil di master_customer untuk orang yang TERBUKTI aktif di ekosistem 20FIT
-- (arena/klinik/hyrox/my20fit) tapi belum ada di pool. Menaikkan cakupan aktivitas 308 → ~800+
-- sehingga workflow welcome/re-engagement punya audiens berkualitas (terbukti aktif).
--
-- KEPUTUSAN PEMILIK PRODUK (2026-08-27): opsi A, consent DI-SKIP — unsubscribe sudah jadi
-- gerbang kontak (K-36) dan profil baru tunduk suppression yang sama.
--
-- ORANG BARU per sumber (email ternormalisasi TAK cocok master, diukur 27 Agu): hyrox 354,
-- my20fit 149, clinic_patients 74, arena 15 → maks ~592 (sebagian tumpang tindih; dedup di sini).
--
-- KOLOM AMAN SAJA (Fase 0 dihormati): full_name, email(+normalized), phone(+normalized),
-- first_unit (dari sumber), source='activity_ingest', tags=['activity_ingest'], first_seen_at.
-- TIDAK diambil: NIK, gol. darah, kontak darurat (hyrox), data kesehatan/siklus (my20fit),
-- tanggal lahir, gender, alamat — kelas Fase 0, butuh dasar hukum tersendiri.
--
-- PENANDA & ROLLBACK: source='activity_ingest' + tag menandai semua baris hasil ingest. Untuk
-- membatalkan: DELETE FROM master_customer WHERE source='activity_ingest' (setelah cek merged_into).
--
-- IDEMPOTEN: hanya insert email/telepon yang belum ada di master. Jalan dua kali tak menduplikasi.
-- NORMALISASI: normalize_email (K-35) + crm_norm_phone (K-06) — sama seperti seluruh pipeline.
-- ============================================================================================

create or replace function public.crm_ingest_activity_people()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- Kumpulkan kandidat dari 5 sumber aktivitas, dedup by coalesce(email,phone) ternormalisasi.
  -- Prioritas nama/telepon: sumber dengan data kontak paling lengkap menang (row_number).
  with candidates as (
    -- hyrox: email saja (tak ada phone di sumber)
    select normalize_email(h.email) as ek, null::text as pk,
           h.full_name as nm, 'event' as unit, 1 as pri
      from public.cf_hyrox_participants h
     where normalize_email(h.email) is not null
    union all
    -- my20fit_user_activity: email saja
    select normalize_email(ua.email), null::text,
           ua.full_name, 'my20fit', 2
      from public.my20fit_user_activity ua
     where normalize_email(ua.email) is not null
    union all
    -- clinic_patients: email + phone
    select normalize_email(cp.email), crm_norm_phone(cp.phone),
           cp.full_name, 'clinic', 3
      from public.clinic_patients cp
     where normalize_email(cp.email) is not null
    union all
    -- arena_bookings: email + phone
    select normalize_email(ab.email), crm_norm_phone(ab.phone),
           ab.full_name, 'arena', 4
      from public.arena_bookings ab
     where normalize_email(ab.email) is not null
  ),
  -- Buang yang emailnya SUDAH ada di master (bukan orang baru).
  new_people as (
    select c.*
      from candidates c
     where not exists (
       select 1 from public.master_customer m where m.email_normalized = c.ek
     )
  ),
  -- Dedup: satu baris per email, ambil sumber prioritas tertinggi (nama/phone paling awal).
  deduped as (
    select distinct on (ek)
           ek, pk, nm, unit
      from new_people
     order by ek, pri, (pk is not null) desc, (nm is not null) desc
  )
  insert into public.master_customer
    (full_name, email, email_normalized, phone_normalized, first_unit,
     source, tags, first_seen_at, created_at, updated_at)
  select
    d.nm, d.ek, d.ek, d.pk, d.unit,
    'activity_ingest', array['activity_ingest'], now(), now(), now()
  from deduped d
  -- Guard idempoten kedua (kalau fungsi dijalankan ulang setelah insert sebagian).
  where not exists (
    select 1 from public.master_customer m where m.email_normalized = d.ek
  );

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.crm_ingest_activity_people() from public, anon, authenticated;
grant execute on function public.crm_ingest_activity_people() to service_role;

-- Jalankan sekali sekarang: ingest → refresh mirror (ikut profil baru) → refresh aktivitas
-- (sekarang orang baru punya event yang resolve ke customer_id). Urutan wajib ini.
select public.crm_ingest_activity_people()    as profil_baru;
select public.crm_refresh_customer_mirror();
select public.crm_refresh_customer_activity() as profil_dengan_aktivitas;

