-- crm_campaign_run — one row per campaign INSTANCE (an "issue"), form B (K-41 approved).
-- GATED: SQL shown, NOT yet applied.
--
-- WHY THIS MUST LAND BEFORE THE FIRST CAMPAIGN. The send idempotency_key is
-- {campaign_id}:{customer_id}:{channel}. Today campaign_id = {segment}:{template}, so a SECOND send
-- to the same segment+template regenerates the SAME keys and is silently skipped as "already sent" —
-- a newsletter could never go out twice. The instance dimension fixes that: campaign_id becomes this
-- table's id, so each issue has its own keys. WITHIN one run, re-running still resumes (same keys →
-- already-sent skipped); a NEW run is a new instance → the same person can be messaged again.
-- The instance id is a STABLE uuid for the life of the run — never per-attempt (that would break
-- resume, the same ban as a random idempotency_key, K-38 correction 2).
--
-- RLS ON / 0 policy / grants to service_role ONLY (crm_* pattern, like crm_segment).
create table if not exists public.crm_campaign_run (
  id           uuid primary key default gen_random_uuid(),   -- THE instance; becomes crm_message_log.campaign_id
  segment_id   uuid not null references public.crm_segment(id) on delete restrict,
  template_key text not null,
  label        text,                        -- human name for the issue, e.g. "Newsletter Sept #1"
  created_by   text,
  created_at   timestamptz not null default now(),
  status       text not null default 'draft'
    check (status in ('draft','sending','sent','stopped'))
);

comment on table public.crm_campaign_run is
  'One row per campaign instance ("issue"). Its id is used as crm_message_log.campaign_id so each '
  'issue has its own deterministic idempotency keys: re-running one run resumes; a new run re-sends.';

-- on delete restrict: a segment with campaign history cannot be deleted out from under its runs
-- (the run must always resolve which criteria it targeted).
create index if not exists crm_campaign_run_segment_idx on public.crm_campaign_run (segment_id, template_key);
create index if not exists crm_campaign_run_status_idx on public.crm_campaign_run (status);

alter table public.crm_campaign_run enable row level security;

revoke all on public.crm_campaign_run from public, anon, authenticated;
grant select, insert, update on public.crm_campaign_run to service_role;
