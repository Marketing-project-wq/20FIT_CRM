-- crm_campaign_draft — saved compose-form snapshots. Separate from crm_campaign_run (which tracks
-- actual campaign INSTANCES): a draft here is the operator's WORK IN PROGRESS, holding every field the
-- composer needs to resume exactly where they left off. Converted to a run when the campaign is sent,
-- then deleted (hard delete, not soft).
--
-- crm_* pattern: RLS on, 0 policy, service_role only.
--
-- REVIEW ONLY — do NOT auto-apply. Run manually after checking.

create table if not exists public.crm_campaign_draft (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null default 'email',
  segment_id    uuid references public.crm_segment(id) on delete set null,
  template_key  text,
  label         text not null default '',
  when_mode     text not null default 'now'
    check (when_mode in ('now', 'schedule')),
  date_wib      text,
  time_wib      text default '09:00',
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.crm_campaign_draft is
  'Saved campaign compose-form snapshots. The operator saves their work in progress here and resumes '
  'later via the Kiriman tab. Hard-deleted when a campaign is sent or when the operator removes it.';

create index if not exists crm_campaign_draft_created_by_idx
  on public.crm_campaign_draft (created_by);

alter table public.crm_campaign_draft enable row level security;

revoke all on public.crm_campaign_draft from public, anon, authenticated;
grant select, insert, update, delete on public.crm_campaign_draft to service_role;

-- ROLLBACK:
--   drop table if exists public.crm_campaign_draft;
