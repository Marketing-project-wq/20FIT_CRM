-- ============================================================================
-- crm_purge_audit_log — tambah famili 'campaign.%' ke denylist KEPATUHAN.
-- GATED: SQL DITUNJUKKAN, BELUM DIJALANKAN (menunggu konfirmasi). create or replace
-- (migrasi 8 & …113518 TIDAK disentuh). Satu perubahan vs …113518: baris
--   or action like 'campaign.%'
-- ditambahkan di KEDUA blok `and not (...)` (query hitung + query delete).
--
-- KENAPA FAMILI BARU, BUKAN export.%: mengirim kampanye BUKAN mengekspor. `export.%`
-- menjawab "data apa yang keluar sistem sebagai BERKAS"; sebuah pengiriman kampanye
-- adalah keputusan kontak keluar, bukan berkas — menaruhnya di export.% membuat layar
-- audit yang menyaring "ekspor" menampilkan pengiriman, dan siapa pun yang bertanya
-- "ekspor apa yang terjadi" mendapat kampanye tercampur. Test paritas lama LULUS, tapi
-- yang lulus klasifikasi retensinya, bukan maknanya. `campaign.%` cocok dgn granularitas
-- sebenarnya: satu baris audit per RUN kirim (satu kampanye), bukan per pesan (telemetri
-- per-pesan ada di crm_message_log, bukan audit). Mengikuti presedent K-09
-- (profile.demographic_updated): berkas ini + retention-policy.ts + parity test bergerak
-- BERSAMA dalam satu commit; parity test kini membaca BERKAS INI.
--
-- Karena 'campaign.%' toh tak ada di allowlist operasional, penambahan denylist TIDAK
-- mengubah perilaku hari ini (baris campaign.% tak pernah dipangkas walau tanpa entri ini);
-- ia mengunci retensi kepatuhan agar tetap benar bila allowlist kelak disunting. Murah
-- HANYA sekarang: crm_message_log nol baris, crm_audit_log nol baris campaign.%/export.campaign_sent.
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
      or action like 'campaign.%'
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
        or action like 'campaign.%'
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
  'Retensi audit: pangkas audit OPERASIONAL >90 hari (allowlist: profile.viewed, list.viewed, search.*, login.*); kategori KEPATUHAN (consent.*/suppression.*/role.*/profile.deleted/profile.demographic_updated/export.*/retention.*/campaign.*) dikecualikan permanen. dry_run=true default. Menonaktifkan trigger append-only lalu menyalakannya kembali. TIDAK dijadwalkan. Keputusan Jeff 2026-08-10; profile.demographic_updated 2026-08-19 (K-09); campaign.* 2026-08-24 (K-39, kirim kampanye = kontak keluar, bukan ekspor); PRD 16.4.';

-- ROLLBACK (kembalikan ke denylist …113518 TANPA campaign.%):
-- create or replace function … (hapus baris `or action like 'campaign.%'` di kedua blok).
