-- ============================================================================
-- crm_purge_audit_log — tambah 'profile.demographic_updated' ke denylist kepatuhan
-- APPLIED 20260819113518 · create or replace (migrasi 8 `20260811034942` TIDAK
-- disentuh — historis). Satu perubahan vs migrasi 8: baris
--   or action = 'profile.demographic_updated'
-- di KEDUA blok `and not (...)` (query hitung + query delete). Karena aksi ini toh
-- tak ada di allowlist, penambahan denylist TIDAK mengubah perilaku hari ini; ia
-- mengunci retensi kepatuhan agar tetap benar bila allowlist kelak disunting. (Opsi 2,
-- K-09: berkas ini + retention-policy.ts + parity test bergerak bersama; parity test
-- kini membaca BERKAS INI, bukan migrasi 8.) Sisanya verbatim dari migrasi 8.
-- ============================================================================
create or replace function public.crm_purge_audit_log(dry_run boolean default true)
returns table (
  was_dry_run   boolean,
  matched_count bigint,
  oldest        timestamptz,
  newest        timestamptz,
  purge_log_id  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_count  bigint;
  v_oldest timestamptz;
  v_newest timestamptz;
  v_log_id bigint;
begin
  select count(*), min(occurred_at), max(occurred_at)
    into v_count, v_oldest, v_newest
  from public.crm_audit_log
  where occurred_at < v_cutoff
    and (
      action = 'profile.viewed'
      or action = 'list.viewed'
      or action like 'search.%'
      or action like 'login.%'
    )
    and not (
      action like 'consent.%'
      or action like 'suppression.%'
      or action like 'role.%'
      or action = 'profile.deleted'
      or action = 'profile.demographic_updated'
      or action like 'export.%'
      or action like 'retention.%'
    );

  v_count := coalesce(v_count, 0);

  if dry_run then
    return query select true, v_count, v_oldest, v_newest, null::bigint;
    return;
  end if;

  insert into public.crm_audit_log (actor_email, action, summary, metadata)
  values (
    'system:retention',
    'retention.purge_executed',
    format('Pemangkasan audit operasional: %s baris memenuhi syarat (rentang %s .. %s), cutoff %s.',
      v_count, v_oldest, v_newest, v_cutoff),
    jsonb_build_object(
      'rows_matched', v_count,
      'oldest', v_oldest,
      'newest', v_newest,
      'cutoff', v_cutoff,
      'dry_run', false
    )
  )
  returning id into v_log_id;

  if v_count = 0 then
    return query select false, 0::bigint, v_oldest, v_newest, v_log_id;
    return;
  end if;

  alter table public.crm_audit_log disable trigger crm_audit_log_block_row_mutation;

  begin
    delete from public.crm_audit_log
    where occurred_at < v_cutoff
      and (
        action = 'profile.viewed'
        or action = 'list.viewed'
        or action like 'search.%'
        or action like 'login.%'
      )
      and not (
        action like 'consent.%'
        or action like 'suppression.%'
        or action like 'role.%'
        or action = 'profile.deleted'
        or action = 'profile.demographic_updated'
        or action like 'export.%'
        or action like 'retention.%'
      )
      and id <> v_log_id;
  exception when others then
    alter table public.crm_audit_log enable trigger crm_audit_log_block_row_mutation;
    raise;
  end;

  alter table public.crm_audit_log enable trigger crm_audit_log_block_row_mutation;

  return query select false, v_count, v_oldest, v_newest, v_log_id;
end;
$$;

comment on function public.crm_purge_audit_log(boolean) is
  'Retensi audit: pangkas audit OPERASIONAL >90 hari (allowlist: profile.viewed, list.viewed, search.*, login.*); kategori KEPATUHAN (consent.*/suppression.*/role.*/profile.deleted/profile.demographic_updated/export.*/retention.*) dikecualikan permanen. dry_run=true default. Menonaktifkan trigger append-only lalu menyalakannya kembali. TIDAK dijadwalkan. Keputusan Jeff 2026-08-10; profile.demographic_updated ditambah 2026-08-19 (Opsi 2, K-09); PRD 16.4.';

-- ROLLBACK (kembalikan ke denylist migrasi 8 TANPA profile.demographic_updated):
-- create or replace function … (hapus baris `or action = 'profile.demographic_updated'`).
