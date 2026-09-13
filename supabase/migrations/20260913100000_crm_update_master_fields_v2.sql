-- ============================================================================================
-- crm_update_master_fields v2 — tambah p_gender, p_date_of_birth, p_blood_type (13 Sep 2026).
-- --------------------------------------------------------------------------------------------
-- ALASAN: Add Contact modal memperbarui gender/DOB/blood_type pada kontak existing, tapi v1
-- RPC hanya menangani full_name/phone_raw/city/first_unit/segment/lifetime_value. Setelah fix
-- RLS P0-6 (DROP POLICY authenticated_full_access, REVOKE grants), direct .update() ke
-- master_customer gagal. Semua tulis wajib lewat RPC SECURITY DEFINER.
--
-- PERUBAHAN dari v1:
--   + p_gender text default null — validasi ('L', 'P')
--   + p_date_of_birth date default null — validasi bukan masa depan
--   + p_blood_type text default null — validasi ('A', 'B', 'AB', 'O')
--   + perubahan ketiga field di-track di v_changed/v_corrected (audit NON-PII)
--   + UPDATE statement memasukkan ketiga kolom baru
--
-- BACKWARD COMPATIBLE: semua parameter baru DEFAULT NULL (= jangan sentuh). Pemanggil lama
-- yang tak mengirim param baru berjalan persis seperti v1. Signature lama di-DROP dahulu
-- karena PostgreSQL memperlakukan signature berbeda sebagai overload terpisah.
--
-- JANGAN JALANKAN OTOMATIS — tinjau dan jalankan manual di Supabase.
-- ============================================================================================

-- Drop signature lama agar tidak ada overload ganda.
drop function if exists public.crm_update_master_fields(uuid,text,text,text,text,text,numeric,uuid,text);

create or replace function public.crm_update_master_fields(
  p_customer_id    uuid,
  p_full_name      text    default null,
  p_phone_raw      text    default null,
  p_city           text    default null,
  p_first_unit     text    default null,
  p_segment        text    default null,
  p_lifetime_value numeric default null,
  p_gender         text    default null,
  p_date_of_birth  date    default null,
  p_blood_type     text    default null,
  p_actor_id       uuid    default null,
  p_actor_email    text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ex        public.master_customer%rowtype;
  v_new_phone text;
  v_changed   text[] := '{}';
  v_corrected text[] := '{}';
begin
  if p_customer_id is null then raise exception 'customer_id is required'; end if;

  -- T5: aktor wajib.
  if p_actor_id is null and p_actor_email is null then
    raise exception 'actor is required: pass p_actor_id and/or p_actor_email (no untraceable writes to master_customer)'
      using errcode = '22023';
  end if;

  select * into v_ex from public.master_customer where customer_id = p_customer_id;
  if not found then raise exception 'no such customer_id: %', p_customer_id; end if;

  -- T1: baris tergabung.
  if v_ex.merged_into is not null then
    return jsonb_build_object('error', 'row_merged');
  end if;

  -- Validasi kosakata tertutup.
  if p_segment is not null and p_segment not in ('loyal','new','potential') then
    raise exception 'invalid segment: %', p_segment using errcode = '22023';
  end if;
  if p_first_unit is not null
     and p_first_unit not in ('20fit_data','arena','clinic','event','my20fit','gym','shop') then
    raise exception 'invalid first_unit: %', p_first_unit using errcode = '22023';
  end if;
  if p_gender is not null and p_gender not in ('L', 'P') then
    raise exception 'invalid gender: %', p_gender using errcode = '22023';
  end if;
  if p_blood_type is not null and p_blood_type not in ('A', 'B', 'AB', 'O') then
    raise exception 'invalid blood_type: %', p_blood_type using errcode = '22023';
  end if;
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future' using errcode = '22023';
  end if;

  -- T4: cap panjang + LTV.
  if p_lifetime_value is not null and p_lifetime_value < 0 then
    raise exception 'lifetime_value must be >= 0' using errcode = '22023';
  end if;
  if p_full_name is not null and char_length(p_full_name) > 120 then
    raise exception 'full_name too long (max 120)' using errcode = '22023';
  end if;
  if p_city is not null and char_length(p_city) > 80 then
    raise exception 'city too long (max 80)' using errcode = '22023';
  end if;

  -- B1: normalisasi telepon.
  if p_phone_raw is not null then
    v_new_phone := crm_norm_phone(p_phone_raw);
    if v_new_phone is null then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
  end if;

  -- Deteksi perubahan — field lama.
  if p_full_name is not null and p_full_name is distinct from v_ex.full_name then
    v_changed := array_append(v_changed, 'full_name');
    if v_ex.full_name is not null then v_corrected := array_append(v_corrected, 'full_name'); end if;
  end if;
  if p_phone_raw is not null and (v_new_phone is distinct from v_ex.phone_normalized
                                  or p_phone_raw is distinct from v_ex.phone_raw) then
    v_changed := array_append(v_changed, 'phone');
    if v_ex.phone_normalized is not null then v_corrected := array_append(v_corrected, 'phone'); end if;
  end if;
  if p_city is not null and p_city is distinct from v_ex.city then
    v_changed := array_append(v_changed, 'city');
    if v_ex.city is not null then v_corrected := array_append(v_corrected, 'city'); end if;
  end if;
  if p_first_unit is not null and p_first_unit is distinct from v_ex.first_unit then
    v_changed := array_append(v_changed, 'first_unit');
    if v_ex.first_unit is not null then v_corrected := array_append(v_corrected, 'first_unit'); end if;
  end if;
  if p_segment is not null and p_segment is distinct from v_ex.segment then
    v_changed := array_append(v_changed, 'segment');
    if v_ex.segment is not null then v_corrected := array_append(v_corrected, 'segment'); end if;
  end if;
  if p_lifetime_value is not null and p_lifetime_value is distinct from v_ex.lifetime_value then
    v_changed := array_append(v_changed, 'lifetime_value');
    if v_ex.lifetime_value is not null then v_corrected := array_append(v_corrected, 'lifetime_value'); end if;
  end if;

  -- Deteksi perubahan — field baru (v2).
  if p_gender is not null and p_gender is distinct from v_ex.gender then
    v_changed := array_append(v_changed, 'gender');
    if v_ex.gender is not null then v_corrected := array_append(v_corrected, 'gender'); end if;
  end if;
  if p_date_of_birth is not null and p_date_of_birth is distinct from v_ex.date_of_birth then
    v_changed := array_append(v_changed, 'date_of_birth');
    if v_ex.date_of_birth is not null then v_corrected := array_append(v_corrected, 'date_of_birth'); end if;
  end if;
  if p_blood_type is not null and p_blood_type is distinct from v_ex.blood_type then
    v_changed := array_append(v_changed, 'blood_type');
    if v_ex.blood_type is not null then v_corrected := array_append(v_corrected, 'blood_type'); end if;
  end if;

  if cardinality(v_changed) = 0 then
    return jsonb_build_object('changed', '[]'::jsonb, 'corrected', '[]'::jsonb);
  end if;

  -- B2: tabrakan telepon → kode BEBAS-PII.
  begin
    update public.master_customer set
      full_name        = coalesce(p_full_name, full_name),
      phone_normalized = case when p_phone_raw is not null then v_new_phone else phone_normalized end,
      phone_raw        = coalesce(p_phone_raw, phone_raw),
      city             = coalesce(p_city, city),
      first_unit       = coalesce(p_first_unit, first_unit),
      segment          = coalesce(p_segment, segment),
      lifetime_value   = coalesce(p_lifetime_value, lifetime_value),
      gender           = coalesce(p_gender, gender),
      date_of_birth    = coalesce(p_date_of_birth, date_of_birth),
      blood_type       = coalesce(p_blood_type, blood_type),
      updated_at       = now()
    where customer_id = p_customer_id;
  exception when unique_violation then
    return jsonb_build_object('error', 'phone_taken');
  end;

  insert into public.crm_audit_log(actor_id, actor_email, action, target_table, target_id, summary, metadata)
  values (p_actor_id, p_actor_email, 'profile.core_updated', 'master_customer', p_customer_id::text,
          'Edit manual kolom inti',
          jsonb_build_object('fields', to_jsonb(v_changed), 'corrected', to_jsonb(v_corrected)));

  return jsonb_build_object('changed', to_jsonb(v_changed), 'corrected', to_jsonb(v_corrected));
end $$;

revoke all on function public.crm_update_master_fields(uuid,text,text,text,text,text,numeric,text,date,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.crm_update_master_fields(uuid,text,text,text,text,text,numeric,text,date,text,uuid,text)
  to service_role;
