-- ============================================================================================
-- MIGRASI 31 · Jadwal kirim campaign (crm_scheduled_send) + pg_cron eksekutor
-- --------------------------------------------------------------------------------------------
-- TUJUAN: operator bisa menjadwalkan kirim campaign pada tanggal + jam WIB, bukan hanya kirim
-- sekarang. Baris pending dieksekusi oleh pg_cron tiap 5 menit lewat pg_net → endpoint app
-- (/api/campaigns/run-scheduled), yang menjalankan jalur sendCampaign yang sama (Mailtrap + HMAC
-- butuh Node, tak bisa murni SQL).
--
-- WAKTU: scheduled_at disimpan UTC. UI menerima input WIB (UTC+7) dan mengonversinya di server.
-- STATUS: pending → sent | failed | cancelled. Eksekutor idempoten: klaim baris dengan
-- UPDATE ... WHERE status='pending' (baris yang sudah diklaim tak diproses dua kali).
-- ============================================================================================

create table if not exists public.crm_scheduled_send (
  id                   uuid primary key default gen_random_uuid(),
  segment_id           uuid not null,
  template_key         text not null,
  run_label            text,
  scheduled_at         timestamptz not null,
  confirmed_large_send boolean not null default false,
  shown_sendable       integer not null default 0,
  status               text not null default 'pending'
                         check (status in ('pending','sent','failed','cancelled')),
  created_by           text,
  created_at           timestamptz not null default now(),
  claimed_at           timestamptz,
  sent_at              timestamptz,
  last_error           text
);

create index if not exists crm_scheduled_send_due_idx
  on public.crm_scheduled_send (status, scheduled_at);

alter table public.crm_scheduled_send enable row level security;
revoke all on public.crm_scheduled_send from public, anon, authenticated;
grant select, insert, update on public.crm_scheduled_send to service_role;

-- ── §2 · Eksekutor: pg_cron tiap 5 menit → pg_net POST ke endpoint app ──────────────────────
-- Kirim email butuh Node (Mailtrap + HMAC) → tak bisa murni SQL. pg_net memanggil endpoint
-- /api/campaigns/run-scheduled yang menjalankan sendCampaign biasa. Endpoint dilindungi header
-- x-cron-secret == SCHEDULED_SEND_CRON_SECRET di Railway.
--
-- PENTING: setiap apply migrasi ini, sekret BARU dibuat dan ditampilkan lewat NOTICE. Set nilai
-- yang muncul sebagai SCHEDULED_SEND_CRON_SECRET di Railway Variables. (Apply ulang = sekret baru,
-- Railway harus diupdate lagi.)
do $$
declare
  cron_secret text := encode(gen_random_bytes(16), 'hex');
  app_url text := 'https://crm.20fit.id';
begin
  if exists (select 1 from cron.job where jobname = 'crm-run-scheduled-sends') then
    perform cron.unschedule('crm-run-scheduled-sends');
  end if;
  perform cron.schedule(
    'crm-run-scheduled-sends',
    '*/5 * * * *',
    format(
      $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L))$cmd$,
      app_url || '/api/campaigns/run-scheduled',
      cron_secret
    )
  );
  raise notice 'SET SCHEDULED_SEND_CRON_SECRET=% IN RAILWAY', cron_secret;
end $$;

