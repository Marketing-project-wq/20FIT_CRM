-- ============================================================================================
-- Migration 19 — schedule the crm_customer_mirror refresh (Dashboard Visual follow-up)
-- APPLIED 20260819061103 · 19th CRM ledger entry (README table row 18 — the migration-9 double
-- apply makes the row number one less than the ledger-entry number).
-- ============================================================================================
-- Product owner approved a DAILY refresh at 03:00 WIB. The database runs in UTC
-- (current_setting('TimeZone') = 'UTC'), and WIB is UTC+7, so:
--
--     03:00 WIB  =  20:00 UTC (the day before)  =  cron '0 20 * * *'
--
-- DO NOT "fix" this to '0 3 * * *' — that would fire at 10:00 WIB, the busiest hour. The cron
-- string is in UTC; the local time it means is 03:00 WIB. (LARANGAN, and K-30.) Verified after
-- apply: next run = 2026-08-20 03:00:00 Asia/Jakarta.
--
-- The job calls the EXISTING refresh function (migration 15) — no second refresh rule. That
-- function does a non-concurrent REFRESH + updates crm_mirror_meta atomically, so refreshed_at
-- and row_count can never disagree with the data.
--
-- Idempotent: unschedule any prior job of this name first, then (re)create it. cron.job is a
-- SHARED table (7 other-team jobs already there), so the name is CRM-prefixed kebab-case to
-- match the existing convention (rb-*, my20fit-*, cancel-expired-bookings, …).
--
-- This does NOT replace anything: manual refresh still exists, refreshed_at still shows, and the
-- 24h staleness threshold stays — cron lowers the chance of stale, it does not guarantee it. A
-- silently-failed cron job surfaces precisely as that 24h "may be behind" warning on the
-- dashboard; failures are also visible in cron.job_run_details (status='failed').
-- ============================================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'crm-refresh-customer-mirror') then
    perform cron.unschedule('crm-refresh-customer-mirror');
  end if;
end $$;

select cron.schedule(
  'crm-refresh-customer-mirror',
  '0 20 * * *',                                  -- 20:00 UTC daily = 03:00 WIB
  $cmd$select public.crm_refresh_customer_mirror();$cmd$
);
