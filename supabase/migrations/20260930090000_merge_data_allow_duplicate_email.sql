-- Allow the same email to appear multiple times in one campaign run's merge data
-- (e.g. one person receives 2 emails with different voucher codes).
-- A row_index distinguishes the occurrences: 0 for the first, 1 for the second, etc.

alter table crm_campaign_merge_data
  add column if not exists row_index integer not null default 0;

alter table crm_campaign_merge_data
  drop constraint if exists uq_merge_data_run_email_field;

alter table crm_campaign_merge_data
  add constraint uq_merge_data_run_email_field_row
  unique (run_id, email_normalized, field_name, row_index);
