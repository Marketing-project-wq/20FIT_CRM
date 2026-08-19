-- ============================================================================
-- crm_upsert_profile_demographic — jalur TULIS demografi (K-14: atomik + audit)
-- APPLIED 20260819113649 (re-apply dengan perbaikan array_append; apply pertama
-- 20260819113452 memakai `v_changed || 'gender'` yang Postgres selesaikan sebagai
-- array_cat → error "malformed array literal". Double-apply seperti migrasi 9; entri
-- ledger 113452 hanya stamp, definisi FINAL = berkas ini.)
-- ----------------------------------------------------------------------------
-- Upsert crm_profile_demographic + audit 'profile.demographic_updated' dalam SATU
-- transaksi. FILL-EMPTY-ONLY: hanya field yang masih null di crm_profile_demographic
-- yang diisi; nilai untuk field yang SUDAH terisi diabaikan (LARANGAN: jangan menimpa;
-- koreksi = keputusan tersendiri). *_source = 'staff_entry' — nilai yang DIIZINKAN
-- CHECK constraint skema (progressive_profiling | staff_entry | backfill_*); BUKAN
-- 'manual_admin' seperti draf docs/RENCANA-tulis-demografi.md (skema menolaknya).
-- Skema hanya punya kolom _source untuk gender/DOB/birth_year (field yang provenansinya
-- ambigu NIK/staging/admin); address/city/province/postal tak punya _source.
-- master_customer TIDAK disentuh. Metadata audit NON-PII: nama field saja, tanpa nilai.
-- Aktor diteruskan pemanggil (server). SECURITY DEFINER; EXECUTE service_role only.
-- Gerbang rute: aksi RBAC profile.edit_demographic (menyunting ≠ membaca).
-- Aksi audit profile.demographic_updated → KEPATUHAN (denylist migrasi B, Opsi 2).
-- ============================================================================
create or replace function public.crm_upsert_profile_demographic(
  p_customer_id   uuid,
  p_gender        text default null,
  p_date_of_birth date default null,
  p_birth_year    int  default null,
  p_address       text default null,
  p_city          text default null,
  p_province      text default null,
  p_postal_code   text default null,
  p_actor_id      uuid default null,
  p_actor_email   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ex public.crm_profile_demographic%rowtype;
  v_changed text[] := '{}';
  v_audit_id bigint;
begin
  if p_customer_id is null then
    raise exception 'customer_id is required';
  end if;
  if not exists (select 1 from public.master_customer where customer_id = p_customer_id) then
    raise exception 'no such customer_id: %', p_customer_id;
  end if;
  if p_gender is not null and p_gender not in ('male','female') then
    raise exception 'gender must be male or female, got %', p_gender;
  end if;

  select * into v_ex from public.crm_profile_demographic where customer_id = p_customer_id;

  if v_ex.gender        is null and p_gender        is not null then v_changed := array_append(v_changed, 'gender'); end if;
  if v_ex.date_of_birth is null and p_date_of_birth is not null then v_changed := array_append(v_changed, 'date_of_birth'); end if;
  if v_ex.birth_year    is null and p_birth_year    is not null then v_changed := array_append(v_changed, 'birth_year'); end if;
  if v_ex.address       is null and p_address       is not null then v_changed := array_append(v_changed, 'address'); end if;
  if v_ex.city          is null and p_city          is not null then v_changed := array_append(v_changed, 'city'); end if;
  if v_ex.province      is null and p_province      is not null then v_changed := array_append(v_changed, 'province'); end if;
  if v_ex.postal_code   is null and p_postal_code   is not null then v_changed := array_append(v_changed, 'postal_code'); end if;

  if array_length(v_changed, 1) is null then
    raise exception 'no fillable (empty) demographic field supplied';
  end if;

  insert into public.crm_profile_demographic as d (
    customer_id, gender, date_of_birth, birth_year, address, city, province, postal_code,
    gender_source, date_of_birth_source, birth_year_source, updated_at
  ) values (
    p_customer_id,
    coalesce(v_ex.gender, p_gender),
    coalesce(v_ex.date_of_birth, p_date_of_birth),
    coalesce(v_ex.birth_year, p_birth_year),
    coalesce(v_ex.address, p_address),
    coalesce(v_ex.city, p_city),
    coalesce(v_ex.province, p_province),
    coalesce(v_ex.postal_code, p_postal_code),
    case when v_ex.gender        is null and p_gender        is not null then 'staff_entry' else v_ex.gender_source end,
    case when v_ex.date_of_birth is null and p_date_of_birth is not null then 'staff_entry' else v_ex.date_of_birth_source end,
    case when v_ex.birth_year    is null and p_birth_year    is not null then 'staff_entry' else v_ex.birth_year_source end,
    now()
  )
  on conflict (customer_id) do update set
    gender        = excluded.gender,
    date_of_birth = excluded.date_of_birth,
    birth_year    = excluded.birth_year,
    address       = excluded.address,
    city          = excluded.city,
    province      = excluded.province,
    postal_code   = excluded.postal_code,
    gender_source        = excluded.gender_source,
    date_of_birth_source = excluded.date_of_birth_source,
    birth_year_source    = excluded.birth_year_source,
    updated_at = now();

  insert into public.crm_audit_log
    (actor_id, actor_email, action, target_table, target_id, summary, metadata)
  values (
    p_actor_id, p_actor_email, 'profile.demographic_updated', 'crm_profile_demographic',
    p_customer_id::text,
    'Demografi profil dilengkapi admin (' || array_length(v_changed,1) || ' field, staff_entry).',
    jsonb_build_object('fields', to_jsonb(v_changed), 'source', 'staff_entry')
  )
  returning id into v_audit_id;

  return jsonb_build_object('customer_id', p_customer_id, 'fields', to_jsonb(v_changed), 'audit_id', v_audit_id);
end;
$$;

comment on function public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text) is
  'Jalur tulis demografi ATOMIK (K-14): fill-empty-only upsert crm_profile_demographic + audit profile.demographic_updated dalam satu transaksi. *_source=staff_entry (nilai CHECK skema). TIDAK menimpa field terisi; master_customer tak disentuh. Metadata audit non-PII. service_role only.';

revoke all on function public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text) to service_role;

-- ROLLBACK: drop function if exists public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text);
