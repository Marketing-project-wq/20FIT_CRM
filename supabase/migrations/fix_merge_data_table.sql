-- Fix: recreate crm_campaign_merge_data with the correct full schema.
-- The table exists but has missing columns. Safe to drop — no production
-- merge data has been successfully stored yet.

drop table if exists crm_campaign_merge_data;

create table crm_campaign_merge_data (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references crm_campaign_run(id) on delete cascade,
  email_normalized text not null,
  field_name    text not null,
  field_value   text not null default '',
  row_index     integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint uq_merge_data_run_email_field_row
    unique (run_id, email_normalized, field_name, row_index)
);

comment on table crm_campaign_merge_data is
  'Per-recipient custom merge field values for mail-merge campaigns. One row per (run, email, field, row_index).';

create index idx_merge_data_run_email on crm_campaign_merge_data (run_id, email_normalized);

alter table crm_campaign_merge_data enable row level security;

create policy "service_role_full_access" on crm_campaign_merge_data
  for all using (true) with check (true);
