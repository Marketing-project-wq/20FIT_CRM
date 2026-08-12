-- ============================================================================
-- Migrasi 11 : crm_backfill_consent()
-- Tujuan     : Backfill consent untuk impor legacy (20fit_data_import) — satu baris
--              consent AKTIF per (profil, channel, purpose) atas keputusan pemilik
--              produk (12 Agu 2026). Menulis marketing DAN transactional.
-- Referensi  : PRD Fase 2; UU 27/2022 (PDP). docs/SIGNOFF-legal-consent.md (pembaruan
--              Migrasi 11). Peta basis→purpose: lib/crm/consent-policy.ts.
-- Reversible : YA, dan MURAH. crm_consent punya NOL trigger (beda dari crm_suppression
--              & crm_audit_log yang append-only). Membatalkan:
--                delete from public.crm_consent where source = '20fit_data_import';
--              `source` + `evidence` membuat undo-nya presisi. (ROLLBACK di bawah.)
--
-- KENAPA FUNGSI POSTGRES, BUKAN supabase-js: K-14 mewajibkan tulis data + tulis audit
--   menyatu dalam SATU transaksi. PostgREST tak bisa membungkus INSERT massal + INSERT
--   audit atomik; plpgsql bisa. Bila audit gagal, seluruh backfill ikut rollback.
--
-- MATRIKS YANG DITULIS (lima kombinasi; sms & marketing+phone_call SENGAJA tidak diisi):
--   marketing     × email        (profil dengan email_normalized)     ~81.637
--   marketing     × whatsapp      (profil dengan phone_normalized)     ~81.615
--   transactional × email         (profil dengan email_normalized)     ~81.637
--   transactional × whatsapp       (profil dengan phone_normalized)    ~81.615
--   transactional × phone_call     (profil dengan phone_normalized)    ~81.615  ← CS
--   Total ~408.119. sms tak dipakai 20FIT; marketing+phone_call tak diminta (keputusan
--   tersendiri bila perlu).
--
-- basis = 'legacy_import_unverified' untuk SEMUA — jujur: tak ada catatan opt-in per
--   orang (first_seen_at seluruhnya cap muat, T-08). explicit_opt_in akan berbohong.
--
-- IDEMPOTEN: unique key crm_consent (customer_id, channel, purpose) + ON CONFLICT DO
--   NOTHING. Panggilan kedua menyisipkan 0 baris; ia TETAP menulis satu baris audit
--   berbunyi inserted=0 — itu memang perilakunya (bukti dijalankan, apa pun hasilnya).
--
-- Aksi audit: 'consent.backfilled' — cocok prefiks 'consent.%' yang SUDAH di DENYLIST
--   kepatuhan migrasi 8 → dikecualikan permanen dari pemangkasan. Diverifikasi oleh
--   lib/crm/retention-policy.parity.test.ts & retention-policy.test.ts.
--
-- KEAMANAN (K-15): SECURITY DEFINER (menulis crm_audit_log yang RLS ON + trigger
--   append-only). EXECUTE DICABUT dari public/anon/authenticated; HANYA service_role.
--   Tanpa ini, pemegang anon key bisa memicu backfill lewat RPC.
--
-- Catatan run: TIDAK otomatis. Tampilkan → berhenti → apply_migration (BUKAN db push)
--   → select crm_backfill_consent() → verifikasi vs count(distinct). Kondisi terverifikasi
--   2026-08-12: crm_consent 0 baris; master_customer 82.253 (email 81.637, phone 81.615).
-- ============================================================================

create or replace function public.crm_backfill_consent(
  p_actor_id    uuid default null,
  p_actor_email text default 'system:consent-backfill'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted bigint;
  v_audit_id bigint;
begin
  -- Lima kombinasi (channel, purpose) dan identitas yang disyaratkan masing-masing.
  with combos(channel, purpose, needs) as (
    values
      ('email'::text,      'marketing'::text,     'email'::text),
      ('whatsapp'::text,   'marketing'::text,     'phone'::text),
      ('email'::text,      'transactional'::text, 'email'::text),
      ('whatsapp'::text,   'transactional'::text, 'phone'::text),
      ('phone_call'::text, 'transactional'::text, 'phone'::text)
  ),
  ins as (
    insert into public.crm_consent
      (customer_id, channel, purpose, basis, status, source, evidence)
    select
      mc.customer_id,
      c.channel,
      c.purpose,
      'legacy_import_unverified',
      'active',
      '20fit_data_import',
      -- NON-PII: menunjuk sumber + tanggal impor, tanpa identitas apa pun.
      jsonb_build_object(
        'source', '20fit_data_import',
        'import_date', '2026-04-20',
        'note', 'legacy bulk import — consent unverified per person'
      )
    from public.master_customer mc
    cross join combos c
    where (c.needs = 'email' and mc.email_normalized is not null)
       or (c.needs = 'phone' and mc.phone_normalized is not null)
    on conflict (customer_id, channel, purpose) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  -- Audit atomik (transaksi sama, K-14). metadata NON-PII: hitungan + kosakata saja.
  insert into public.crm_audit_log
    (actor_id, actor_email, action, target_table, summary, metadata)
  values (
    p_actor_id,
    p_actor_email,
    'consent.backfilled',
    'crm_consent',
    'Backfill consent legacy dijalankan (' || v_inserted || ' baris disisipkan).',
    jsonb_build_object(
      'inserted', v_inserted,
      'basis', 'legacy_import_unverified',
      'source', '20fit_data_import',
      'purposes', jsonb_build_array('marketing', 'transactional'),
      'channels', jsonb_build_array('email', 'whatsapp', 'phone_call')
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object('inserted', v_inserted, 'audit_id', v_audit_id);
end;
$$;

comment on function public.crm_backfill_consent(uuid, text) is
  'Backfill consent legacy (Migrasi 11): insert marketing+transactional untuk 20fit_data_import ATOMIK dengan audit consent.backfilled (K-14). basis=legacy_import_unverified. Idempoten via unique key + ON CONFLICT DO NOTHING. Reversibel: delete where source=20fit_data_import (crm_consent nol trigger). service_role only.';

-- HANYA service role yang boleh mengeksekusi (K-15). Supabase memberi EXECUTE ke
-- anon/authenticated secara default pada tiap fungsi public baru; `revoke ... from public`
-- TIDAK mencabut grant per-peran itu — jadi anon & authenticated HARUS dicabut namanya.
revoke all on function public.crm_backfill_consent(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_backfill_consent(uuid, text) to service_role;

-- ROLLBACK (jalankan manual bila perlu membatalkan):
--   -- 1. batalkan datanya (murah — nol trigger, undo presisi lewat source):
--   delete from public.crm_consent where source = '20fit_data_import';
--   -- 2. buang fungsinya:
--   drop function if exists public.crm_backfill_consent(uuid, text);
