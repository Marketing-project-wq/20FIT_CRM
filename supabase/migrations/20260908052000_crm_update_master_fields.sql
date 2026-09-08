-- ============================================================================================
-- crm_update_master_fields — jalur UPDATE master_customer PERTAMA di aplikasi (8 Sep 2026).
-- APPLIED 20260908051431 (definisi FINAL). Apply PERTAMA 20260908051258 memakai
-- `v_changed || 'city'` yang Postgres selesaikan sebagai array_cat → "malformed array literal"
-- saat DIPANGGIL (CREATE FUNCTION lolos — T-48). Persis migrasi 9/17; diperbaiki ke array_append.
-- Double-apply: entri ledger 051258 hanya stamp, definisi FINAL = berkas ini (reconcile by NAME,
-- T-20). Ditangkap oleh uji panggilan-sungguhan yang diwajibkan, bukan oleh CREATE yang berhasil.
-- --------------------------------------------------------------------------------------------
-- Beda dari crm_upsert_profile_demographic (yang FILL-EMPTY ke tabel terpisah): ini BOLEH
-- mengoreksi nilai yang sudah ada, langsung di master_customer (keputusan pemilik 8 Sep —
-- membalik aturan baca-saja secara sadar; catatan kaki profil diperbarui agar tak berbohong).
-- SECURITY DEFINER, EXECUTE service_role ONLY. Audit 'profile.core_updated' ditulis ATOMIK
-- (K-14) di transaksi yang sama, metadata NON-PII: nama field + penanda 'corrected', TANPA nilai.
-- p_* = null ⇒ jangan sentuh; mengosongkan field tak didukung v1 (dinyatakan di layar).
--
-- Lima gerbang, semua diukur dari produksi 8 Sep 2026:
--   T1  baris tergabung (merged_into) ditolak — datanya sudah pindah; 0 baris hari ini, tapi RPC
--       menerima customer_id apa pun (K-58 melewatkannya di jalur tag; sama, bukan aturan baru).
--   T3  first_unit '20fit_data' TETAP diterima (81.178 baris memilikinya) tapi dropdown UI tak
--       menawarkannya — penanda asal muatan, bukan unit bisnis. Trade-off: sekali diubah dari
--       dropdown, tak bisa dipulihkan lewat UI (dinyatakan ke pemilik).
--   T4  lifetime_value < 0 ditolak; cap panjang nama 120 / kota 80 (maks nyata 46 / 33 + ruang).
--   T5  AKTOR WAJIB — panggilan ditolak bila p_actor_id DAN p_actor_email dua-duanya null.
--       Jalur tulis pertama ke master_customer tak boleh dipakai tanpa jejak siapa yang memakainya;
--       350/351 baris crm_audit_log punya aktor, dan impor 8 Sep menghasilkan 0 audit justru karena
--       jalur langsung melewati aktor (T-65). crm_ingest_csv_people punya kelemahan yang sama dan
--       BELUM ditutup — tindak lanjut, di luar lingkup putaran ini.
--   B1/B2 telepon dinormalisasi DI DALAM lewat crm_norm_phone (di-paritas kanon TS); tabrakan
--       indeks unik parsial phone_normalized ditangkap → kode BEBAS-PII 'phone_taken' (tak pernah
--       menyebut nomor/identitas pemilik lama). B4: telepon berubah bila ternormalisasi ATAU raw beda.
-- Kosakata segment/first_unit dijaga parity test TS↔SQL (lib/crm/core-vocab.parity.test.ts).
-- ============================================================================================
create or replace function public.crm_update_master_fields(
  p_customer_id    uuid,
  p_full_name      text    default null,
  p_phone_raw      text    default null,
  p_city           text    default null,
  p_first_unit     text    default null,
  p_segment        text    default null,
  p_lifetime_value numeric default null,
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

  -- T5: aktor wajib. Baris audit tanpa pelaku adalah audit yang berpura-pura.
  if p_actor_id is null and p_actor_email is null then
    raise exception 'actor is required: pass p_actor_id and/or p_actor_email (no untraceable writes to master_customer)'
      using errcode = '22023';
  end if;

  select * into v_ex from public.master_customer where customer_id = p_customer_id;
  if not found then raise exception 'no such customer_id: %', p_customer_id; end if;

  -- T1: baris tergabung sudah memindahkan datanya; mengeditnya = menulis ke catatan yang tak dibaca.
  if v_ex.merged_into is not null then
    return jsonb_build_object('error', 'row_merged');
  end if;

  -- B3/T3: kosakata tertutup, divalidasi di SQL (pertahanan berlapis; UI menyodorkan dropdown).
  if p_segment is not null and p_segment not in ('loyal','new','potential') then
    raise exception 'invalid segment: %', p_segment using errcode = '22023';
  end if;
  if p_first_unit is not null
     and p_first_unit not in ('20fit_data','arena','clinic','event','my20fit','gym','shop') then
    raise exception 'invalid first_unit: %', p_first_unit using errcode = '22023';
  end if;

  -- T4: LTV negatif ditolak; cap panjang teks bebas.
  if p_lifetime_value is not null and p_lifetime_value < 0 then
    raise exception 'lifetime_value must be >= 0' using errcode = '22023';
  end if;
  if p_full_name is not null and char_length(p_full_name) > 120 then
    raise exception 'full_name too long (max 120)' using errcode = '22023';
  end if;
  if p_city is not null and char_length(p_city) > 80 then
    raise exception 'city too long (max 80)' using errcode = '22023';
  end if;

  -- B1: turunkan telepon ternormalisasi DI SINI. Tak terbaca ditolak, bukan diam-diam dinull-kan.
  if p_phone_raw is not null then
    v_new_phone := crm_norm_phone(p_phone_raw);
    if v_new_phone is null then
      raise exception 'invalid_phone' using errcode = '22023';
    end if;
  end if;

  -- Deteksi perubahan. B4: telepon berubah bila ternormalisasi ATAU raw berbeda.
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
    v_changed := array_append(v_changed, 'lifetime_value');   -- B5: kemunculannya = penanda manual (dibaca UI)
    if v_ex.lifetime_value is not null then v_corrected := array_append(v_corrected, 'lifetime_value'); end if;
  end if;

  if cardinality(v_changed) = 0 then
    return jsonb_build_object('changed', '[]'::jsonb, 'corrected', '[]'::jsonb);
  end if;

  -- B2: tabrakan telepon → kode BEBAS-PII. Tak ada update/audit di jalur ini.
  begin
    update public.master_customer set
      full_name        = coalesce(p_full_name, full_name),
      phone_normalized = case when p_phone_raw is not null then v_new_phone else phone_normalized end,
      phone_raw        = coalesce(p_phone_raw, phone_raw),
      city             = coalesce(p_city, city),
      first_unit       = coalesce(p_first_unit, first_unit),
      segment          = coalesce(p_segment, segment),
      lifetime_value   = coalesce(p_lifetime_value, lifetime_value),
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

revoke all on function public.crm_update_master_fields(uuid,text,text,text,text,text,numeric,uuid,text)
  from public, anon, authenticated;
grant execute on function public.crm_update_master_fields(uuid,text,text,text,text,text,numeric,uuid,text)
  to service_role;
