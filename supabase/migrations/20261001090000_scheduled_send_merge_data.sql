-- Migration: add merge_data_json to crm_scheduled_send
-- Stores mail-merge CSV data so scheduled sends retain merge placeholders.
-- Without this, scheduled sends produce empty merge tags because the merge data
-- was only stored at send time (on crm_campaign_merge_data keyed by run_id),
-- and the run doesn't exist yet when a send is scheduled.
--
-- JALANKAN DI SUPABASE SQL EDITOR.

alter table public.crm_scheduled_send
  add column if not exists merge_data_json jsonb;

comment on column public.crm_scheduled_send.merge_data_json is
  'Mail-merge rows as JSON array [{email, rowIndex, fields:{...}}]. Copied into crm_campaign_merge_data when the executor creates the run.';
