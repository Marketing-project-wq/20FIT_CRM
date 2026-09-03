-- MIGRASI B (T-42) — add 'partial' and 'failed' to crm_campaign_run_status_check.
--
-- WHY: nextRunStatus never looked at the failure counts, so a run where every recipient failed was
-- written as 'sent'. The 3 Sep 2026 run (124 accepted by the provider, 18,119 failed) is filed
-- 'sent' in this table right now. Two honest end-states are added:
--   partial — some recipients were sent to, some failed.
--   failed  — failures with nothing sent at all.
--
-- NEITHER IS RESUMABLE. listResumableRuns queries RESUMABLE_RUN_STATUSES = {draft, sending} only
-- (lib/crm/campaign-run-status.ts), getRunForPair re-checks the same rule, and both are locked by
-- lib/crm/campaign-run.test.ts. This matters concretely: making a new status resumable is what would
-- let the 3 Sep run be re-sent to 18,119 people, part of whom were already contacted by other means.
--
-- NO BACKFILL. Not one existing row is rewritten — restating an old run's status is a separate
-- owner decision, and this migration deliberately does not take it. The 3 Sep run keeps status
-- 'sent'; its 18,119 failures become visible through the deliveries list's failure count instead.
--
-- APPLIED + VERIFIED 2026-09-03 (ledger stamp 20260903125151 — differs from this file name, apply
-- time). Post-apply, re-read from pg_constraint:
--   CHECK ((status = ANY (ARRAY['draft','sending','sent','stopped','partial','failed'])))
-- convalidated = true. No backfill: all 14 run rows untouched, 5f5f3a57 still status 'sent', and the
-- listResumableRuns-equivalent query for its (segment, template) pair returns ZERO rows.
--
-- Pre-apply state (read from pg_constraint 2026-09-03):
--   CHECK ((status = ANY (ARRAY['draft','sending','sent','stopped'])))

alter table public.crm_campaign_run
  drop constraint if exists crm_campaign_run_status_check;

alter table public.crm_campaign_run
  add constraint crm_campaign_run_status_check
    check (status = any (array['draft', 'sending', 'sent', 'stopped', 'partial', 'failed']));

comment on constraint crm_campaign_run_status_check on public.crm_campaign_run is
  'Run end-states. partial = some sent, some failed; failed = nothing sent. Only draft and sending are resumable (RESUMABLE_RUN_STATUSES) — a finished or failed run is never re-offered, T-42.';

-- ROLLBACK (safe only while NO row carries a new value — check first):
--   select status, count(*) from public.crm_campaign_run
--    where status in ('partial','failed') group by 1;
--   -- if that returns no rows:
--   alter table public.crm_campaign_run drop constraint if exists crm_campaign_run_status_check;
--   alter table public.crm_campaign_run add constraint crm_campaign_run_status_check
--     check (status = any (array['draft','sending','sent','stopped']));
--   -- and revert the app FIRST (lib/crm/campaign-run-status.ts back to the 4-status union),
--   -- otherwise finalizeRunStatus's UPDATE throws and the run keeps whatever status it had.
