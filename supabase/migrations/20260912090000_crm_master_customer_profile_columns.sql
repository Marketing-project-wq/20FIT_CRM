-- ============================================================================================
-- Add profile columns to master_customer for CSV import (gender, date_of_birth, blood_type).
-- --------------------------------------------------------------------------------------------
-- CATATAN ARSITEKTUR: crm_profile_demographic sudah memiliki gender dan date_of_birth
-- sebagai tabel satelit/kurasi. Kolom di master_customer ini ditambahkan agar pipeline impor
-- CSV bisa menulis data profil langsung saat impor, tanpa jalur tulis kedua ke tabel terpisah.
-- Kedua sumber (import layer vs curated layer) bisa direkonsiliasi di masa depan.
--
-- blood_type diklasifikasikan sebagai SensitiveKind di enrichment-constants.ts dan sebelumnya
-- hanya ada di clinic_screenings. Penambahan di sini memerlukan pertimbangan legal basis
-- tersendiri — review sebelum menerapkan migrasi ini.
--
-- JANGAN JALANKAN OTOMATIS — tinjau dan jalankan manual di Supabase.
-- ============================================================================================

-- 1. Tambah kolom profil ke master_customer
alter table public.master_customer
  add column if not exists gender text,
  add column if not exists date_of_birth date,
  add column if not exists blood_type text;

-- 2. Update crm_ingest_csv_people agar bisa menerima dan menulis kolom profil baru
create or replace function public.crm_ingest_csv_people(
  p_rows jsonb,
  p_batch_id uuid,
  p_collection_source text,
  p_uploaded_by uuid,
  p_tag_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad_tags    text[];
  v_inserted    integer;
  v_tagged      integer;
  v_shared_bat  integer;
begin
  select array_agg(distinct t) into v_bad_tags
    from (
      select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb)) as t
        from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
      union all
      select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb)) as t
        from jsonb_array_elements(coalesce(p_tag_rows, '[]'::jsonb)) r
    ) x
   where t !~ '^(event|format|kategori|nilai|peran|produk|sumber|tipe):[a-z0-9][a-z0-9-]*$';

  if v_bad_tags is not null then
    raise exception 'crm_ingest_csv_people: % invalid tag(s), e.g. %',
      cardinality(v_bad_tags), (v_bad_tags)[1:5]
      using errcode = '22023';
  end if;

  with input as (
    select
      nullif(trim(r->>'full_name'), '')                  as full_name,
      nullif(trim(r->>'email'), '')                      as email_raw,
      lower(nullif(trim(r->>'email_normalized'), ''))    as ek,
      nullif(trim(r->>'phone_normalized'), '')           as pk,
      nullif(trim(r->>'city'), '')                       as city,
      nullif(trim(r->>'gender'), '')                     as gender,
      case
        when nullif(trim(r->>'date_of_birth'), '') is not null
        then nullif(trim(r->>'date_of_birth'), '')::date
        else null
      end                                                as date_of_birth,
      nullif(trim(r->>'blood_type'), '')                 as blood_type,
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb))), '{}') as row_tags
    from jsonb_array_elements(p_rows) r
  ),
  valid as (
    select * from input
     where ek is not null and ek like '%@%'
       and (pk is null or pk ~ '^62[0-9]+$')
  ),
  new_people as (
    select v.* from valid v
     where not exists (select 1 from public.master_customer m where m.email_normalized = v.ek)
  ),
  deduped as (
    select distinct on (ek) full_name, email_raw, ek, pk, city, gender, date_of_birth, blood_type, row_tags
      from new_people
     order by ek, (pk is not null) desc, (full_name is not null) desc
  ),
  phone_safe as (
    select
      full_name, email_raw, ek, city, gender, date_of_birth, blood_type, row_tags,
      case
        when pk is null then null
        when exists (select 1 from public.master_customer m where m.phone_normalized = pk) then null
        when count(*) over (partition by pk) > 1 then null
        else pk
      end as pk,
      (pk is not null
        and not exists (select 1 from public.master_customer m where m.phone_normalized = pk)
        and count(*) over (partition by pk) > 1) as shared_phone_in_batch
    from deduped
  ),
  ins as (
    insert into public.master_customer
      (full_name, email, email_normalized, phone_normalized, city,
       gender, date_of_birth, blood_type,
       source, tags, first_seen_at, created_at, updated_at)
    select
      full_name, email_raw, ek, pk, city,
      gender, date_of_birth, blood_type,
      'csv_import',
      array(select distinct unnest(array['csv_import', 'batch:' || p_batch_id::text] || row_tags) order by 1),
      now(), now(), now()
    from phone_safe
    returning customer_id
  ),
  tag_targets as (
    select
      lower(trim(r->>'email')) as ek,
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'tags', '[]'::jsonb))), '{}') as row_tags
    from jsonb_array_elements(coalesce(p_tag_rows, '[]'::jsonb)) r
  ),
  upd as (
    update public.master_customer m
       set tags = array(
             select distinct unnest(
               coalesce(m.tags, '{}') || array['tagged:' || p_batch_id::text] || t.row_tags
             ) order by 1)
      from tag_targets t
     where m.email_normalized = t.ek
       and m.merged_into is null
    returning m.customer_id
  ),
  cons as (
    insert into public.crm_consent
      (customer_id, channel, purpose, basis, status, source, evidence, recorded_at, updated_at)
    select
      i.customer_id, 'email', 'marketing', 'explicit_opt_in', 'active', 'csv_import',
      jsonb_build_object(
        'source', 'csv_import',
        'batch', p_batch_id::text,
        'uploaded_by', p_uploaded_by::text,
        'collection_source', p_collection_source
      ),
      now(), now()
    from ins i
    returning 1
  )
  select
    (select count(*) from cons),
    (select count(*) from upd),
    (select count(*) from phone_safe where shared_phone_in_batch)
  into v_inserted, v_tagged, v_shared_bat;

  return jsonb_build_object(
    'inserted',              v_inserted,
    'tagged_existing',       v_tagged,
    'shared_phone_in_batch', v_shared_bat
  );
end $$;

revoke all on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_csv_people(jsonb, uuid, text, uuid, jsonb) to service_role;
