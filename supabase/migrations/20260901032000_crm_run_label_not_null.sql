-- Enforce the "every campaign has a name" invariant at the database, now that the app requires a name
-- for new runs (validateCampaignName) and the legacy NULLs were backfilled in the migration just prior.
-- APPLY ONLY AFTER the backfill leaves zero NULLs — verified before running (README ledger).
--
-- Safe because: new runs get a required, validated name; resume runs reuse an existing (now non-null)
-- name; the scheduled-send cron always writes a run_label (the composer sends one, and its own fallback
-- covers any legacy pending row).

alter table crm_campaign_run   alter column label     set not null;
alter table crm_scheduled_send alter column run_label set not null;
