-- ============================================================================
-- Migrasi 9 : crm_record_suppression + crm_lift_suppression
-- Tujuan     : Jalur TULIS pertama sistem. Menulis/mencabut baris crm_suppression
--              ATOMIK dengan baris crm_audit_log dalam SATU transaksi (syarat K-3).
-- Referensi  : PRD Fase 2; UU 27/2022. Header crm_suppression (D-1/D-2/D-4).
-- Reversible : Ya untuk fungsinya (drop function). Baris suppression yang sudah
--              ditulis TIDAK boleh dihapus (catatan permintaan orang sungguhan).
--
-- KENAPA FUNGSI POSTGRES, BUKAN supabase-js: PostgREST tak bisa membungkus dua
--   INSERT ke tabel berbeda dalam satu transaksi. K-3 mewajibkan tulis suppression +
--   tulis audit menyatu; audit best-effort = kekuatan pembuktian hilang diam-diam.
--
-- K-3 (atomik): kedua INSERT ada di dalam SATU fungsi plpgsql → satu transaksi. Bila
--   yang kedua gagal, yang pertama ikut rollback. Tak ada baris separuh jadi.
--
-- D-2 (JANGAN normalkan di SQL): identity_key diterima SUDAH ternormalisasi dari
--   lib/crm/normalize.ts (kanon 62… tanpa +, email huruf kecil). Fungsi ini HANYA
--   MENOLAK masukan yang jelas belum ternormalisasi (jaring pengaman terhadap bypass
--   SQL editor) — ia TIDAK menormalkan. Menormalkan di sini = implementasi kedua =
--   pencocokan gagal diam-diam.
--
-- D-4 (sticky): NOL DELETE. Pencabutan = status='lifted' + lifted_at + lifted_reason
--   + baris audit. Idempoten: klik dua kali tak menggandakan baris audit (ON state).
--
-- Aktor: p_actor_id / p_actor_email diteruskan dari pemanggil (server, service role) —
--   BUKAN current_user database (database tak tahu manusia di balik service role).
--
-- Aksi audit: 'suppression.added' / 'suppression.lifted'. Keduanya cocok prefix
--   'suppression.%' yang SUDAH ada di DENYLIST kepatuhan migrasi 8 → dikecualikan
--   permanen dari pemangkasan (permintaan berhenti = bukti hukum). Diverifikasi oleh
--   test paritas (lib/crm/retention-policy.parity.test.ts) & retention-policy.test.ts.
--
-- KEAMANAN: SECURITY DEFINER (menulis ke crm_audit_log yang RLS ON + trigger
--   append-only). EXECUTE DICABUT dari public/anon/authenticated, HANYA service_role
--   yang boleh — kalau tidak, pemegang anon key bisa menulis suppression lewat RPC.
--
-- Catatan run: TIDAK otomatis. Tampilkan → berhenti → jalankan via apply_migration
--   (BUKAN db push). Kondisi terverifikasi 2026-08-11: crm_suppression 0 baris.
-- ============================================================================

create or replace function public.crm_record_suppression(
  p_identity_kind text,
  p_identity_key  text,
  p_reason_code   text,
  p_reason_detail text default null,
  p_customer_id   uuid default null,
  p_source        text default null,
  p_actor_id      uuid default null,
  p_actor_email   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_status text;
  v_id uuid;
  v_reactivated boolean := false;
  v_audit_id bigint;
begin
  -- Jaring pengaman (BUKAN normalisasi) — tolak yang jelas belum ternormalisasi.
  if p_identity_kind not in ('phone','email') then
    raise exception 'identity_kind must be phone or email, got %', p_identity_kind;
  end if;
  if p_identity_key is null or length(trim(p_identity_key)) = 0 then
    raise exception 'identity_key is required';
  end if;
  if p_identity_kind = 'phone' and p_identity_key !~ '^62[0-9]+$' then
    raise exception 'phone identity_key not normalized (expected 62… digits only, no +)';
  end if;
  if p_identity_kind = 'email'
     and (p_identity_key <> lower(p_identity_key) or position('@' in p_identity_key) = 0) then
    raise exception 'email identity_key not normalized (expected lowercase containing @)';
  end if;
  if p_reason_code not in ('user_request','complaint','bounce','legal','legacy_import') then
    raise exception 'invalid reason_code: %', p_reason_code;
  end if;

  -- Kunci baris eksisting (bila ada) untuk memutuskan insert / reaktivasi / no-op.
  select status, id into v_prev_status, v_id
  from public.crm_suppression
  where identity_kind = p_identity_kind and identity_key = p_identity_key
  for update;

  if not found then
    insert into public.crm_suppression
      (identity_kind, identity_key, customer_id, reason_code, reason_detail, status, source)
    values
      (p_identity_kind, p_identity_key, p_customer_id, p_reason_code, p_reason_detail, 'active', p_source)
    returning id into v_id;
  elsif v_prev_status = 'lifted' then
    update public.crm_suppression
      set status = 'active',
          reason_code = p_reason_code,
          reason_detail = p_reason_detail,
          customer_id = coalesce(p_customer_id, customer_id),
          source = coalesce(p_source, source),
          lifted_at = null,
          lifted_reason = null
    where id = v_id;
    v_reactivated := true;
  else
    -- Sudah active: idempoten no-op, TANPA baris audit (aman klik dua kali).
    return jsonb_build_object('id', v_id, 'status', 'active', 'action', 'noop');
  end if;

  -- Audit atomik (transaksi sama). metadata NON-PII: TANPA identity_key, TANPA reason_detail.
  insert into public.crm_audit_log
    (actor_id, actor_email, action, target_table, target_id, summary, metadata)
  values (
    p_actor_id, p_actor_email, 'suppression.added', 'crm_suppression', v_id::text,
    'Permintaan berhenti dihubungi dicatat (' || p_identity_kind || ').',
    jsonb_build_object('identity_kind', p_identity_kind, 'reason_code', p_reason_code, 'reactivated', v_reactivated)
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'id', v_id, 'status', 'active', 'action', 'added',
    'reactivated', v_reactivated, 'audit_id', v_audit_id
  );
end;
$$;

create or replace function public.crm_lift_suppression(
  p_identity_kind text,
  p_identity_key  text,
  p_lifted_reason text,
  p_actor_id      uuid default null,
  p_actor_email   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_status text;
  v_id uuid;
  v_audit_id bigint;
begin
  if p_identity_kind not in ('phone','email') then
    raise exception 'identity_kind must be phone or email';
  end if;
  if p_lifted_reason is null or length(trim(p_lifted_reason)) = 0 then
    raise exception 'lifted_reason is required to lift a suppression';
  end if;

  select status, id into v_prev_status, v_id
  from public.crm_suppression
  where identity_kind = p_identity_kind and identity_key = p_identity_key
  for update;

  if not found then
    raise exception 'no suppression exists for this identity';
  end if;
  if v_prev_status = 'lifted' then
    return jsonb_build_object('id', v_id, 'status', 'lifted', 'action', 'noop');
  end if;

  update public.crm_suppression
    set status = 'lifted', lifted_at = now(), lifted_reason = p_lifted_reason
  where id = v_id;

  insert into public.crm_audit_log
    (actor_id, actor_email, action, target_table, target_id, summary, metadata)
  values (
    p_actor_id, p_actor_email, 'suppression.lifted', 'crm_suppression', v_id::text,
    'Suppression dicabut — orang ini bisa dihubungi lagi (' || p_identity_kind || ').',
    jsonb_build_object('identity_kind', p_identity_kind)
  )
  returning id into v_audit_id;

  return jsonb_build_object('id', v_id, 'status', 'lifted', 'action', 'lifted', 'audit_id', v_audit_id);
end;
$$;

comment on function public.crm_record_suppression(text,text,text,text,uuid,text,uuid,text) is
  'Jalur tulis suppression ATOMIK (K-3): insert/reaktivasi crm_suppression + audit suppression.added dalam satu transaksi. TIDAK menormalkan (D-2) — hanya menolak yang belum ternormalisasi. Idempoten. Aktor diteruskan pemanggil. service_role only.';
comment on function public.crm_lift_suppression(text,text,text,uuid,text) is
  'Pencabutan suppression ATOMIK (K-3/D-4): status=lifted + audit suppression.lifted dalam satu transaksi. NOL DELETE. lifted_reason wajib. service_role only.';

-- HANYA service role yang boleh mengeksekusi — cegah pemegang anon key menulis lewat RPC.
-- CATATAN: Supabase memberi EXECUTE ke anon/authenticated secara default pada tiap fungsi
-- public baru (lewat default privileges). `revoke ... from public` TIDAK mencabut grant
-- peran eksplisit itu — jadi anon & authenticated HARUS dicabut namanya. SECURITY DEFINER
-- berarti fungsi jalan sebagai owner: kalau anon boleh EXECUTE, pemegang anon key bisa
-- menulis suppression lewat RPC tanpa lewat gerbang aplikasi.
revoke all on function public.crm_record_suppression(text,text,text,text,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.crm_lift_suppression(text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.crm_record_suppression(text,text,text,text,uuid,text,uuid,text) to service_role;
grant execute on function public.crm_lift_suppression(text,text,text,uuid,text) to service_role;

-- ROLLBACK (jalankan manual bila perlu membatalkan — hanya fungsinya, JANGAN sentuh baris):
-- drop function if exists public.crm_record_suppression(text,text,text,text,uuid,text,uuid,text);
-- drop function if exists public.crm_lift_suppression(text,text,text,uuid,text);
