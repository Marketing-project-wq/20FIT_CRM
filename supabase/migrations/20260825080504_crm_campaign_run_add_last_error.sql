-- crm_campaign_run.last_error — so a run that HALTED before/without sending leaves a reason, not
-- silence (T-30). PII-free classified cause; NULL for a healthy run. The send path sets status
-- 'stopped' + last_error when sendCampaign throws (e.g. a required secret is unset). No new grants:
-- service_role already has UPDATE on this table.
-- Applied + verified 2026-08-25 (ledger 20260825080504): column text NULL added; the two orphan
-- draft runs from the 24→25 Aug internal-test attempts were retroactively marked
-- status='stopped' + last_error='send_threw:missing_env:UNSUBSCRIBE_TOKEN_SECRET'. README ledger row 29.
alter table public.crm_campaign_run add column if not exists last_error text;

comment on column public.crm_campaign_run.last_error is
  'PII-free classified cause when a run halted before/without sending (status stopped). NULL for a '
  'healthy run. Set by the send path so a stopped run leaves a reason, not silence (T-30).';
