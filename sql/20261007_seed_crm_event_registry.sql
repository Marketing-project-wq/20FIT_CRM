-- SEED — pre-populate crm_event_registry from TODAY'S automatic prefix grouping, so an
-- admin starts with the current behaviour already captured and only has to REVIEW and
-- ADJUST (merge "ISS JHR 2026" with "ISS JHR Day", rename, split) rather than build from
-- scratch.
--
-- ─────────────────────────────────────────────────────────────────────────────────
-- DO NOT AUTO-RUN. Run the schema migration first
-- (supabase/migrations/20261007090000_crm_event_registry.sql), then review THIS script
-- and run it manually in the Supabase SQL Editor. Re-running is safe (idempotent:
-- ON CONFLICT DO NOTHING on both the event slug and the global tag_slug).
-- ─────────────────────────────────────────────────────────────────────────────────
--
-- The grouping mirrors lib/crm/event-analytics.ts → eventGroupKey(), character for
-- character, so the seed reproduces what the page shows today:
--   1. strip a distance/format suffix:  -2.7k | -5k | -10k | -21k | -hm
--   2. strip a race-format suffix:       -half | -single | -double(s) | -relay
--   3. strip a day suffix (+ trailing):  -fri|-sat|-sun|-mon|-tue|-wed|-thu (-…)*
--   4. apply explicit aliases:           sportfest-v-02→sportfest-2, platarox-racelab→platarox-2026-07
-- The result, prefixed with "event:" in TS, is the group. Here we keep the bare value as
-- the event slug and derive a Title Case name from it. BOTH are meant to be edited.
--
-- Source of tags: crm_tag_registry (namespace = 'event'). If some event: tags exist only
-- on master_customer.tags and were never registered, register them first (Settings → Tags)
-- or extend this script's source — the registry UI will still surface them as "unassigned".

begin;

-- 1. One curated event per prefix-group.
insert into public.crm_event_registry (name, slug, created_by)
select distinct
       initcap(replace(grp.group_slug, '-', ' ')) as name,
       grp.group_slug                             as slug,
       'seed:prefix-grouping'                     as created_by
from (
  select
    case
      when base = 'sportfest-v-02'    then 'sportfest-2'
      when base = 'platarox-racelab'  then 'platarox-2026-07'
      else base
    end as group_slug
  from (
    select regexp_replace(
             regexp_replace(
               regexp_replace(
                 substring(r.slug from 7),                        -- drop leading "event:"
                 '-(2\.7k|5k|10k|21k|hm)$', '', 'i'),             -- (1) distance/format
               '-(half|single|doubles?|relay)$', '', 'i'),        -- (2) race format
             '-(fri|sat|sun|mon|tue|wed|thu)(-[a-z0-9]+)*$', '', 'i') as base  -- (3) day
    from public.crm_tag_registry r
    where r.namespace = 'event'
  ) stripped
) grp
on conflict (slug) do nothing;

-- 2. Assign every event: tag to the event row for its prefix-group.
insert into public.crm_event_registry_tags (event_id, tag_slug)
select er.id, src.tag_slug
from (
  select
    r.slug as tag_slug,
    case
      when base = 'sportfest-v-02'    then 'sportfest-2'
      when base = 'platarox-racelab'  then 'platarox-2026-07'
      else base
    end as group_slug
  from (
    select
      r.slug,
      regexp_replace(
        regexp_replace(
          regexp_replace(
            substring(r.slug from 7),
            '-(2\.7k|5k|10k|21k|hm)$', '', 'i'),
          '-(half|single|doubles?|relay)$', '', 'i'),
        '-(fri|sat|sun|mon|tue|wed|thu)(-[a-z0-9]+)*$', '', 'i') as base
    from public.crm_tag_registry r
    where r.namespace = 'event'
  ) r
) src
join public.crm_event_registry er on er.slug = src.group_slug
on conflict (tag_slug) do nothing;

-- Review before committing: `select * from crm_event_registry order by slug;`
-- and `select er.name, t.tag_slug from crm_event_registry_tags t
--      join crm_event_registry er on er.id = t.event_id order by er.name, t.tag_slug;`
commit;
